"""Check attached DEV service identity's Firebase read permission, without user data."""
import json
import urllib.request
import uuid

try:
    project = urllib.request.urlopen(urllib.request.Request(
        'http://metadata.google.internal/computeMetadata/v1/project/project-id',
        headers={'Metadata-Flavor': 'Google'}), timeout=10).read().decode()
    assert project == 'dev-moles-under-the-pitch-org'
    token = json.load(urllib.request.urlopen(urllib.request.Request(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        headers={'Metadata-Flavor': 'Google'}), timeout=10))['access_token']
    body = json.dumps({'localId': ['nonexistent-dev-probe-' + uuid.uuid4().hex]}).encode()
    request = urllib.request.Request('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:lookup',
        data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        assert response.status == 200
        assert not json.load(response).get('users')
    print('PASS attached DEV identity can perform Firebase account lookup; no real user data requested or logged.')
except Exception:
    print('DEV Firebase permission/connectivity check failed; no provider details or token logged.')
    raise SystemExit(1)
