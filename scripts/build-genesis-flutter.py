#!/usr/bin/env python3
"""Build the Flutter platform; the Go web server serves its compiled assets."""
import os,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
flutter=os.environ.get('FLUTTER_BIN') or shutil.which('flutter') or str(root/'.local/flutter/bin/flutter')
app=root/'apps/genesis_flutter'
subprocess.run([flutter,'pub','get'],cwd=app,check=True)
subprocess.run([flutter,'build','web','--release','--base-href','/genesis-flutter/','--no-web-resources-cdn'],cwd=app,check=True)
print('Arkom Flutter compilada em apps/genesis_flutter/build/web')
