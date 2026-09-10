import jwt
from jwt import PyJWKClient

from cwms_batch_events.core.settings import settings

AUTH_HOST = settings.auth_host
AUTH_REALM = settings.auth_realm

KEYCLOAK_ISSUER = f"{AUTH_HOST}/realms/{AUTH_REALM}"
KEYCLOAK_JWKS = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"

PUBLIC_KEY = {
    "PROD": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAgaLcKGp9KKeN+8REa4oHK41PQYpvIeP7XpXmPB70cV8uBBx8Er3SDrZ2TAz9UKZ2Z6m6QRreQjgk2FI+EQ2bHWToMRhnthIzbuHzI64GyBjCnGhu3sd0OFb9wTAvu6TcV7w+q7+WrVIF1vzHlpFo7qLewxJjEAKzJGx3EgDFhlRCPXG4BjP4Lsg/rBpV3ltZ74HtTlx3r7XeDKCIIgqAJOQueaQtwR7Snp2FFY3is/PHrWNKWLw3lRV0Lm4VtGHm4YOAqCwq6FfyHLjjohp2JXuzTVB+9s7cmbLq1dyDBCWkX02s4g3AZuJcycyrie+8TDvbCJ+ogHLcixwLDizXaQIDAQAB",
    "TEST": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArYxyX6mFWXEEpi8GhEs8GbUjZwYLIJ7ixEIoIZN1f4C7LoNMxz5mrDZcojNi91xSXqtFLlXfYTc/sI4JLYUEzKE0fNUxY9jldzI36ZLvIMqGg7KqaFukI3WO1AVejkJ77Lox+V20nJoZTrO577uElfIsqlJc11HHojME4f/Q7OOYoTPE4yYOGP8WbLPg4CSiSNR+ZYA4JdDLMZxD+FduhHkE7QbPZGsZqXCnr1UDzgNUaXFbufsmGo1N2h9eQOTNu6aV9zI7DdMZkVCbApwEov+p2n8EMp3xAZ5tAviXNzP8z3oifsw8XQLFFCyUUEr8e3kCmLW97lV7ys5iWnNhMQIDAQAB",
}

ISSUER = {
    "PROD": "https://identity.cwbi.mil/auth/realms/cwbi",
    "TEST": "https://identity-test.cwbi.mil/auth/realms/cwbi",
}


def get_public_pem():
    try:
        public_key = PUBLIC_KEY[settings.auth_environment]
    except KeyError as e:
        print(
            f"Cannot find PUBLIC_KEY for AUTH_ENVIRONMENT setting of '{settings.auth_environment}'"
        )
        raise e
    return raw_key_to_pem(public_key)


def raw_key_to_pem(key: str) -> str:
    pem_str = "-----BEGIN PUBLIC KEY-----\n"
    pem_str += f"{key}\n"
    pem_str += "-----END PUBLIC KEY-----"
    return pem_str


def verify_jwt(token: str) -> dict:
    if settings.auth_environment == "LOCAL":
        return verify_jwt_by_api(token)
    else:
        return verify_jwt_by_saved_key(token)


def verify_jwt_by_api(token: str) -> dict:
    jwks = PyJWKClient(KEYCLOAK_JWKS)
    key = jwks.get_signing_key_from_jwt(token)
    payload = jwt.decode(token, key, ["RS256"])
    return payload


def verify_jwt_by_saved_key(token: str) -> dict:
    key = get_public_pem()
    payload = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        issuer=ISSUER[settings.auth_environment],
        options={"verify_aud": False},
    )
    return payload
