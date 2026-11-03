"""Real CLI installation, not an exporter substitute. Execute only in hosted CI.

No model session, MCP command, login, OAuth, existing HOME/config/credential is used.
The only settings touched belong to a newly created, job-private client HOME.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

REPOSITORY = "ibank-ax/madang-plugins"
PUBLIC_GIT = "https://github.com/ibank-ax/madang-plugins.git"
SOURCE = "cae1f0851c7ca07dd0233ae8719929b9d2ee6562"
PRODUCTS = ("dev", "docs", "ux", "works", "asset", "aio")
INSTALLERS = {
    # Official installation pages, retrieved 2026-11-04:
    # https://learn.chatgpt.com/docs/codex/cli
    # https://code.claude.com/docs/en/setup
    # https://cursor.com/docs/cli/installation
    "codex": ("https://chatgpt.com/codex/install.sh", "sh"),
    "claude": ("https://claude.ai/install.sh", "bash"),
    "cursor": ("https://cursor.com/install", "bash"),
}


class VerificationError(RuntimeError):
    pass


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(value: object, code: str) -> None:
    if value is not True:
        raise VerificationError(code)


def json_output(text: str) -> object:
    try:
        return json.loads(text)
    except ValueError:
        # Native Claude CLI documents its JSON result on the final stdout line.
        for line in reversed(text.splitlines()):
            try:
                return json.loads(line)
            except ValueError:
                continue
    raise VerificationError("CLIENT_JSON_MISSING")


def objects(value: object):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from objects(item)
    elif isinstance(value, list):
        for item in value:
            yield from objects(item)


class Verification:
    def __init__(self, client: str, temporary: Path, output: Path) -> None:
        self.client, self.temporary, self.output = client, temporary, output
        self.home = temporary / "client-home"
        self.work = temporary / "empty-project"
        self.home.mkdir()
        self.work.mkdir()
        # Deliberate allowlist. Do not copy a runner's credentials, API keys,
        # Git/CLI configuration, credential helpers, SSH agent or token variables.
        self.env = {
            "PATH": str(self.home / ".local/bin") + ":" + os.defpath,
            "HOME": str(self.home),
            "TMPDIR": str(temporary),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "XDG_DATA_HOME": str(self.home / ".local/share"),
            "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TERM": "dumb", "CI": "true",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
            "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "/bin/false",
            "GIT_SSH_COMMAND": "false", "CLAUDE_CODE_PLUGIN_PREFER_HTTPS": "1",
            "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1",
        }
        self.receipt: dict[str, object] = {
            "schema": 1, "client": client, "publicRepository": REPOSITORY,
            "requestedPublicRevision": SOURCE, "controllerRevision": os.environ.get("GITHUB_SHA"),
            "productsRequired": list(PRODUCTS), "requiredInstallations": 6,
            "installedAndListed": 0, "plugins": [], "commands": [],
            "personalHomeRead": False, "existingCredentialsUsed": False,
            "loginExecuted": False, "oauthConsentExecuted": False, "modelSessionExecuted": False,
            "mcpInvocationExecuted": False, "guiVerified": False,
            "skillsEvidence": "native-installed payload references; no model/skill execution",
            "complete": False,
        }

    def clean(self, text: str) -> str:
        return text.replace(str(self.temporary), "$ISOLATED_ROOT")

    def run(self, phase: str, argv: list[str], *, timeout: int = 180,
            allow_failure: bool = False, help_output: bool = False) -> str:
        result = subprocess.run(argv, env=self.env, cwd=self.work, input=b"",
                                capture_output=True, timeout=timeout, check=False)
        self.receipt["commands"].append({
            "phase": phase, "argv": [self.clean(arg) for arg in argv], "exitCode": result.returncode,
            "stdoutSha256": digest(result.stdout), "stderrSha256": digest(result.stderr),
        })
        text = result.stdout.decode("utf-8", errors="replace")
        if help_output:
            (self.output / (phase + ".txt")).write_text(self.clean(text))
        if result.returncode != 0 and not allow_failure:
            self.receipt["failedPhase"] = phase
            # Public CLI diagnostics only: no full logs, state, environment or data.
            tail = result.stderr.decode("utf-8", errors="replace")[-1500:]
            self.receipt["publicClientDiagnostic"] = self.clean(tail)
            raise VerificationError("NATIVE_COMMAND_FAILED")
        print(f"CLIENT_PHASE {self.client} {phase} exit={result.returncode}", flush=True)
        return text

    def install_client(self) -> str:
        url, shell = INSTALLERS[self.client]
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        require(len(data) <= 2 * 1024 * 1024, "INSTALLER_TOO_LARGE")
        installer = self.temporary / "official-installer.sh"
        installer.write_bytes(data)
        self.receipt["installer"] = {"url": url, "sha256": digest(data)}
        self.run("official-installer", [shell, str(installer)], timeout=300)
        names = ("agent", "cursor-agent") if self.client == "cursor" else (self.client,)
        candidates = [self.home / ".local/bin" / name for name in names]
        binary = next((p for p in candidates if p.is_file()), None)
        require(binary is not None, "OFFICIAL_CLIENT_BINARY_MISSING")
        version = self.run("version", [str(binary), "--version"]).strip()
        require(bool(version) and len(version) < 300, "CLIENT_VERSION_INVALID")
        self.receipt["clientVersion"] = self.clean(version)
        self.client_help = self.run("client-help", [str(binary), "--help"], help_output=True)
        return str(binary)

    def reference(self) -> tuple[Path, dict[str, dict]]:
        source = self.temporary / "anonymous-public-source"
        self.run("anonymous-clone", ["git", "-c", "credential.helper=", "clone", "--no-checkout", PUBLIC_GIT, str(source)])
        self.run("anonymous-checkout", ["git", "-C", str(source), "checkout", "--detach", SOURCE])
        actual = self.run("anonymous-revision", ["git", "-C", str(source), "rev-parse", "HEAD"]).strip()
        require(actual == SOURCE, "PUBLIC_REVISION_MISMATCH")
        catalogs = {"codex": ".agents/plugins/marketplace.json", "claude": ".claude-plugin/marketplace.json",
                    "cursor": ".cursor-plugin/marketplace.json"}
        catalog = json.loads((source / catalogs[self.client]).read_text())
        require(catalog["name"] == "madang", "MARKETPLACE_NAME_MISMATCH")
        entries = {entry["name"]: entry for entry in catalog["plugins"]}
        require(set(entries) == set(PRODUCTS), "SIX_PRODUCT_DENOMINATOR_CHANGED")
        self.receipt["anonymousPublicRevision"] = actual
        self.receipt["catalogSha256"] = digest((source / catalogs[self.client]).read_bytes())
        return source, entries

    def payload(self, installed: Path, reference: Path, name: str, version: str) -> dict:
        require(installed.is_dir() and installed.resolve().is_relative_to(self.home.resolve()), "INSTALLED_PATH_OUTSIDE_ISOLATION")
        files = [path for path in reference.rglob("*") if path.is_file()]
        require(bool(files), "REFERENCE_PACKAGE_EMPTY")
        skills = []
        for path in files:
            require(not path.is_symlink(), "REFERENCE_SYMLINK_UNSUPPORTED")
            relative = path.relative_to(reference)
            actual = installed / relative
            require(actual.is_file() and not actual.is_symlink() and actual.read_bytes() == path.read_bytes(),
                    "INSTALLED_PAYLOAD_MISMATCH")
            if relative.name == "SKILL.md":
                skills.append({"path": relative.as_posix(), "sha256": digest(actual.read_bytes())})
        return {"name": name, "version": version, "installed": True, "listedByNativeClient": True,
                "matchedPayloadFiles": len(files), "skills": skills, "skillReferences": len(skills)}

    def verify(self, binary: str, source: Path, entries: dict[str, dict]) -> None:
        self.run("plugin-help", [binary, "plugin", "--help"], help_output=True)
        if self.client == "codex":
            registered = json_output(self.run("marketplace-add", [binary, "plugin", "marketplace", "add", PUBLIC_GIT,
                                                                      "--ref", SOURCE, "--json"]))
            require(isinstance(registered, dict) and registered.get("marketplaceName") == "madang", "MARKETPLACE_NOT_REGISTERED")
            self.run("marketplace-list", [binary, "plugin", "marketplace", "list", "--json"])
        else:
            registered = json_output(self.run("marketplace-add", [binary, "plugin", "marketplace", "add",
                                                                      PUBLIC_GIT + "#" + SOURCE, "--json"]))
            require(isinstance(registered, dict) and registered.get("outcome") == "ok", "MARKETPLACE_NOT_REGISTERED")
            self.run("marketplace-list", [binary, "plugin", "marketplace", "list", "--json"])
        self.receipt["nativeMarketplaceRegistered"] = True
        for name in PRODUCTS:
            verb = "add" if self.client == "codex" else "install"
            result = json_output(self.run("install-" + name, [binary, "plugin", verb, name + "@madang", "--json"]))
            if self.client == "claude":
                require(isinstance(result, dict) and result.get("outcome") == "ok", "PLUGIN_INSTALL_NOT_OK")
            listing = json_output(self.run("list-" + name, [binary, "plugin", "list", "--json"]))
            pool = listing.get("installed", []) if self.client == "codex" and isinstance(listing, dict) else listing
            listed = [item for item in objects(pool) if item.get("id") == name + "@madang"
                      or item.get("pluginId") == name + "@madang"
                      or (item.get("name") == name and item.get("marketplaceName") == "madang")]
            require(bool(listed), "PLUGIN_NOT_IN_NATIVE_LIST")
            path = result.get("installedPath") if isinstance(result, dict) else None
            if not path:
                path = next((item.get("installPath") or item.get("installedPath") for item in listed
                             if item.get("installPath") or item.get("installedPath")), None)
            if not path and self.client == "claude":
                state = self.home / ".claude/plugins/installed_plugins.json"
                require(state.is_file(), "NATIVE_INSTALL_STATE_MISSING")
                state_items = json.loads(state.read_text()).get("plugins", {}).get(name + "@madang", [])
                path = next((item.get("installPath") for item in state_items if item.get("installPath")), None)
            require(isinstance(path, str), "NATIVE_INSTALLED_PATH_MISSING")
            entry = entries[name]
            relative = entry["source"]["path"] if isinstance(entry["source"], dict) else entry["source"]
            reference = (source / relative).resolve()
            require(reference.is_relative_to(source), "REFERENCE_PATH_ESCAPE")
            plugin = self.payload(Path(path), reference, name, entry["version"])
            self.receipt["plugins"].append(plugin)
            self.receipt["installedAndListed"] = len(self.receipt["plugins"])
        require(self.receipt["installedAndListed"] == 6, "INSTALLATION_DENOMINATOR_INCOMPLETE")
        self.receipt["complete"] = True

    def cursor_capabilities(self, binary: str) -> None:
        # Official Cursor docs specify GUI/team import for installation. Do not
        # invent an unattended installation command or report a file copy as one.
        command = re.search(r"(?m)^\s+(plugins?)\b", self.client_help)
        text = self.run("cursor-plugin-help", [binary, command.group(1), "--help"],
                        allow_failure=True, help_output=True) if command else ""
        self.receipt["cursorCapabilityProbe"] = {
            "installVerbAdvertised": re.search(r"(?m)^\s+(?:install|add)\b", text) is not None,
            "pluginCommandAdvertised": command is not None,
            "officialInstallSurface": "Customize / Team Marketplace UI",
            "remoteGuiVerified": False,
        }
        self.receipt["limitation"] = "CURSOR_UNATTENDED_INSTALL_NOT_YET_VERIFIED"
        self.receipt["capabilityDiscoveryComplete"] = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", choices=INSTALLERS, required=True)
    args = parser.parse_args()
    require(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted",
            "GITHUB_HOSTED_ONLY")
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "REPOSITORY_MISMATCH")
    root = Path(__file__).resolve().parents[1]
    output = root / "results/client-install" / args.client
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="public-plugin-client-", dir=os.environ["RUNNER_TEMP"]) as directory:
        verification = Verification(args.client, Path(directory), output)
        code = 1
        try:
            verification.receipt["controllerRevision"] = verification.run(
                "controller-revision", ["git", "-C", str(root), "rev-parse", "HEAD"]).strip()
            binary = verification.install_client()
            source, entries = verification.reference()
            if args.client == "cursor":
                verification.cursor_capabilities(binary)
                code = 0  # Capability probe only; complete remains false, installed=0.
            else:
                verification.verify(binary, source, entries)
                code = 0
        except Exception as error:
            verification.receipt["failureCode"] = str(error) if isinstance(error, VerificationError) else type(error).__name__
        finally:
            (output / "receipt.json").write_text(json.dumps(verification.receipt, ensure_ascii=False, indent=2) + "\n")
        print(f"CLIENT_RESULT {args.client} installed={verification.receipt['installedAndListed']}/6 complete={verification.receipt['complete']}", flush=True)
        return code


if __name__ == "__main__":
    raise SystemExit(main())
