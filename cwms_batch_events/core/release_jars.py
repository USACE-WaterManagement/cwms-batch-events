import hashlib
import hmac
import time
from urllib.parse import urlparse, unquote

import requests

from cwms_batch_events.core.models import ReleaseJar
from cwms_batch_events.core.settings import RepositorySettings, get_settings

MAX_JAR_SIZE = 512 * 1024 * 1024


def office_repository(office):
    settings = get_settings()
    ref = settings.github_repository_ref or {"local": "cwbi-dev", "dev": "cwbi-dev", "test": "cwbi-test", "prod": "cwbi-prod"}.get(settings.deployment_environment, settings.deployment_environment)
    return settings.office_repositories.get(office.upper()) or RepositorySettings(
        repository=f"USACE-WaterManagement/{office.lower()}-wm-cwbi-jobs", ref=ref)


def github(path, binary=False):
    from cwms_batch_events.core.github_app import installation_token
    response = requests.get(f"https://api.github.com/repos/{path}", headers={
        "Authorization": f"Bearer {installation_token()}",
        "Accept": "application/octet-stream" if binary else "application/vnd.github+json",
        "User-Agent": "cwms-batch-events",
    }, timeout=(5, 30), stream=binary, allow_redirects=False)
    if binary and response.status_code == 302:
        location = response.headers.get("Location", "")
        response.close()
        parsed = urlparse(location)
        if parsed.scheme != "https" or parsed.hostname not in {"release-assets.githubusercontent.com", "objects.githubusercontent.com"}:
            raise ValueError("Unexpected release download location")
        # Never forward the installation token to the download host.
        response = requests.get(location, stream=True, timeout=(5, 30), allow_redirects=False)
    if response.status_code != 200:
        response.close()
        raise ValueError("GitHub release is unavailable")
    return response


def release_selection(repository, release, asset):
    digest = asset.get("digest") or ""
    if not digest.startswith("sha256:"):
        return None
    try:
        return ReleaseJar(repository=repository, release_id=release["id"], asset_id=asset["id"],
            tag=release["tag_name"], name=asset["name"], sha256=digest[7:], size=asset["size"])
    except (ValueError, KeyError):
        return None


def validate_selection(office, selection):
    if selection.repository != office_repository(office).repository:
        raise ValueError("Select a JAR from this office's configured repository")
    with github(f"{selection.repository}/releases/{selection.release_id}") as response:
        release = response.json()
    if release.get("draft"):
        raise ValueError("Draft releases cannot be selected")
    with github(f"{selection.repository}/releases/assets/{selection.asset_id}") as response:
        asset = response.json()
    download = urlparse(asset.get("browser_download_url", ""))
    expected = f"/{selection.repository}/releases/download/{release['tag_name']}/{selection.name}"
    if download.hostname == "github.com" and unquote(download.path) == expected and release_selection(selection.repository, release, asset) == selection:
        return
    raise ValueError("The release asset changed or is unavailable. Select it again.")


def download_ticket(job_id, key, expires=None):
    expires = expires or int(time.time()) + 7 * 86400
    value = f"release-jar:{job_id}:{expires}"
    signature = hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature}"


def valid_ticket(job_id, ticket, key):
    try:
        expires = int(ticket.split('.')[0])
        return time.time() < expires <= time.time() + 7 * 86400 + 60 and hmac.compare_digest(ticket, download_ticket(job_id, key, expires))
    except (ValueError, AttributeError):
        return False


# Runs using Python already present in the job image. Download credentials only
# authorize this job's saved JAR. Java is exec'd so its exit code and signals win.
BOOTSTRAP = '''import hashlib, os, sys, tempfile, urllib.request
url, ticket, digest, expected = sys.argv[1:5]
directory = tempfile.mkdtemp(prefix="cwms-release-")
path = os.path.join(directory, "job.jar")
try:
    request = urllib.request.Request(url, headers={"X-Artifact-Ticket": ticket})
    checksum = hashlib.sha256()
    size = 0
    with urllib.request.urlopen(request, timeout=60) as source, open(path, "wb") as target:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > int(expected):
                raise ValueError("Release JAR exceeds its saved size")
            checksum.update(chunk)
            target.write(chunk)
    if size != int(expected) or checksum.hexdigest() != digest:
        raise ValueError("Release JAR checksum or size does not match the saved selection")
except Exception:
    print("Release JAR download or verification failed. Java was not started.", file=sys.stderr)
    sys.exit(1)
os.execvp("java", ["java", "-jar", path, *sys.argv[5:]])
'''


def jar_command(message, base_url, key):
    asset = message.payload.release_jar
    if not base_url or not key:
        raise ValueError("Release JAR download requires the Batch Events API URL and internal key")
    return ["python", "-c", BOOTSTRAP, f"{base_url.rstrip('/')}/release-jars/jobs/{message.job_id}",
            download_ticket(message.job_id, key), asset.sha256, str(asset.size), *message.payload.command_args]
