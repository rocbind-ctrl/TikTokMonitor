# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata


datas = [
    ("templates", "templates"),
    ("static", "static"),
]

for package in (
    "apscheduler",
    "curl_cffi",
    "fastapi",
    "jinja2",
    "pywebview",
    "starlette",
    "uvicorn",
    "webview",
    "yt_dlp",
):
    try:
        datas += collect_data_files(package)
    except Exception:
        pass
    try:
        datas += copy_metadata(package)
    except Exception:
        pass

hiddenimports = []
for package in (
    "apscheduler",
    "curl_cffi",
    "uvicorn",
    "webview",
    "yt_dlp",
):
    hiddenimports += collect_submodules(package)

hiddenimports += [
    "apscheduler.schedulers.background",
    "apscheduler.triggers.interval",
    "multipart",
    "python_multipart",
    "uvicorn.lifespan.on",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "webview.platforms.winforms",
]


a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="TikTokMonitorReplica",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
