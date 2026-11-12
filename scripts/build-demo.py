#!/usr/bin/env python3
"""Build local demo binaries from this repository; does not start services."""
import os,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bin_dir=root/'.local/bin';bin_dir.mkdir(parents=True,exist_ok=True)
for directory,name,target in [('services/sdr','bia','.'),('services/crm','crm','./cmd/crm-worker'),('packages/deeph','deeph','./cmd/deeph')]:
 subprocess.run(['go','build','-o',str(bin_dir/name),target],cwd=root/directory,check=True)
subprocess.run(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],cwd=root/'apps/portal',check=True)
subprocess.run(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],cwd=root/'packages/genesis-frontend',check=True)
subprocess.run([sys.executable,str(root/'scripts/build-genesis-flutter.py')],cwd=root,check=True)
print('Build concluído. Configure .env e execute python3 scripts/demo.py')
