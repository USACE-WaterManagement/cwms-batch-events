import uuid

from cwms_batch_events.core.settings import settings

BATCH_RUNNER_ID = "58600a09-f18e-42c5-9d3c-df52ebe409f9"
LOCAL_RUNNER_ID = "13f391ef-7597-4b4b-a0ef-0926c09d4649"


def get_runner_id() -> uuid.UUID:
    return (
        uuid.UUID(LOCAL_RUNNER_ID)
        if settings.default_job_runner == "docker-local"
        else uuid.UUID(BATCH_RUNNER_ID)
    )


def get_runner_slug() -> str:
    return "docker-local" if settings.default_job_runner == "docker-local" else "batch"


ALL_OFFICES = [
    "MVS",
    "LRDO",
    "NWK",
    "SAW",
    "NAD",
    "NWO",
    "SPD",
    "MVN",
    "SWT",
    "MVP",
    "SAJ",
    "SWG",
    "LRN",
    "LRE",
    "SWL",
    "LRB",
    "NAE",
    "NAP",
    "POD",
    "SPN",
    "LRH",
    "SAD",
    "NAB",
    "NAO",
    "NWW",
    "NWDP",
    "SPL",
    "MVM",
    "NWDM",
    "SAS",
    "SAC",
    "LRDG",
    "POH",
    "POA",
    "SWF",
    "SPA",
    "LRL",
    "MVR",
    "NWP",
    "NWS",
    "MVK",
    "LRD",
    "NWD",
    "MVD",
    "SPK",
    "LRP",
    "SAM",
    "NAN",
    "LRC",
    "SWD",
    "STUDY",
    "EL",
    "WPC",
    "HEC",
    "CERL",
    "WCSC",
    "IWR",
    "SERFC",
    "LCRA",
    "CRREL",
    "ITL",
    "NDC",
    "CPC",
    "HQ",
    "CWMS",
    "GSL",
    "CHL",
    "TEC",
    "UNK",
    "ERD",
]

ALL_ROLES = [
    "All Users",
    "CCP Mgr",
    "CCP Proc",
    "CCP Reviewer",
    "CWMS DBA Users",
    "CWMS PD Users",
    "CWMS User Admins",
    "CWMS Users",
    "Data Acquisition Mgr",
    "Data Exchange Mgr",
    "NWO_Readonly_Users",
    "RDL Mgr",
    "RDL Reviewer",
    "TS ID Creator",
    "VT Mgr",
    "Viewer Users",
]


ALL_OFFICE_ROLES = dict.fromkeys(ALL_OFFICES, ALL_ROLES)
