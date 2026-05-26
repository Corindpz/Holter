# holter.spec
block_cipher = None

a = Analysis(
    ['holter.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('settings.json', '.'),
        ('mapping.json', '.'),
        ('src/api/static', 'src/api/static'),
        ('src/export/templates', 'src/export/templates'),
    ],
    hiddenimports=[
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols', 'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto', 'uvicorn.lifespan',
        'uvicorn.lifespan.on', 'chromadb', 'sentence_transformers',
        'xhtml2pdf', 'chardet', 'psutil',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='holter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    icon=None,
)
