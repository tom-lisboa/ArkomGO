#!/usr/bin/env python3
"""Build the Flutter Genesis studio and copy its assets into the existing portal."""
import os,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
flutter=os.environ.get('FLUTTER_BIN') or shutil.which('flutter') or str(root/'.local/flutter/bin/flutter')
app=root/'apps/genesis_flutter'
subprocess.run([flutter,'pub','get'],cwd=app,check=True)
subprocess.run([flutter,'build','web','--release','--base-href','/genesis-flutter/','--no-web-resources-cdn'],cwd=app,check=True)
output=root/'apps/portal/public/genesis-flutter'
if output.exists():shutil.rmtree(output)
shutil.copytree(app/'build/web',output)
print('Genesis Flutter pronto em /genesis-flutter/index.html')
