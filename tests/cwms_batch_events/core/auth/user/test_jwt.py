from unittest import mock

import pytest

from cwms_batch_events.core.auth.user.jwt import (
    ISSUER,
    get_public_pem,
    raw_key_to_pem,
    verify_jwt,
    verify_jwt_by_api,
    verify_jwt_by_saved_key,
)


def test_production_issuer_uses_cwbi_keycloak():
    assert ISSUER["PROD"] == "https://identity.cwbi.mil/auth/realms/cwbi"


def test_raw_key_to_pem_wraps_public_key():
    pem = raw_key_to_pem("abc123")

    assert pem == "-----BEGIN PUBLIC KEY-----\nabc123\n-----END PUBLIC KEY-----"


def test_get_public_pem_uses_current_auth_environment():
    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.settings.auth_environment", "TEST"
    ):
        pem = get_public_pem()

    assert pem.startswith("-----BEGIN PUBLIC KEY-----")
    assert pem.endswith("-----END PUBLIC KEY-----")


def test_get_public_pem_raises_for_unknown_environment():
    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.settings.auth_environment", "BOGUS"
    ):
        with pytest.raises(KeyError):
            get_public_pem()


def test_verify_jwt_routes_local_to_api_verification():
    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.settings.auth_environment", "LOCAL"
    ), mock.patch(
        "cwms_batch_events.core.auth.user.jwt.verify_jwt_by_api",
        return_value={"sub": "123"},
    ) as verify_api:
        payload = verify_jwt("token")

    assert payload == {"sub": "123"}
    verify_api.assert_called_once_with("token")


def test_verify_jwt_routes_non_local_to_saved_key_verification():
    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.settings.auth_environment", "TEST"
    ), mock.patch(
        "cwms_batch_events.core.auth.user.jwt.verify_jwt_by_saved_key",
        return_value={"sub": "123"},
    ) as verify_saved:
        payload = verify_jwt("token")

    assert payload == {"sub": "123"}
    verify_saved.assert_called_once_with("token")


def test_verify_jwt_by_api_uses_jwks_client():
    jwks_client = mock.Mock()
    signing_key = mock.Mock(key="pubkey")
    jwks_client.get_signing_key_from_jwt.return_value = signing_key

    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.PyJWKClient",
        return_value=jwks_client,
    ) as jwk_client_cls, mock.patch(
        "cwms_batch_events.core.auth.user.jwt.jwt.decode",
        return_value={"sub": "123"},
    ) as jwt_decode:
        payload = verify_jwt_by_api("token")

    assert payload == {"sub": "123"}
    jwk_client_cls.assert_called_once()
    jwt_decode.assert_called_once_with("token", signing_key, ["RS256"])


def test_verify_jwt_by_saved_key_uses_saved_public_key_and_issuer():
    mock_issuer = {"TEST": "https://keycloak.issuer.com"}

    with mock.patch(
        "cwms_batch_events.core.auth.user.jwt.settings.auth_environment", "TEST"
    ), mock.patch(
        "cwms_batch_events.core.auth.user.jwt.get_public_pem",
        return_value="pem",
    ), mock.patch(
        "cwms_batch_events.core.auth.user.jwt.ISSUER", mock_issuer
    ), mock.patch(
        "cwms_batch_events.core.auth.user.jwt.jwt.decode",
        return_value={"sub": "123"},
    ) as jwt_decode:
        payload = verify_jwt_by_saved_key("token")

    assert payload == {"sub": "123"}
    jwt_decode.assert_called_once_with(
        "token",
        "pem",
        algorithms=["RS256"],
        issuer=mock_issuer["TEST"],
        options={"verify_aud": False},
    )
