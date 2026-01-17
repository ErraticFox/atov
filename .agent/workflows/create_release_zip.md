---
description: Create a zip release for Chrome Web Store
---

1. Create a release directory if it doesn't exist (optional, script handles output path) and zip the file.
// turbo
2. Run the following PowerShell script to creaet the zip file `atov-release.zip` in the root directory:
```powershell
$exclude = @(".git", ".agent", ".claude", "examples", "*.zip", "node_modules", ".gitignore", "atov-release.zip", "*.md", "eslint.config.js", "package.json", "package-lock.json")
$files = Get-ChildItem -Path . -Exclude $exclude
Compress-Archive -Path $files -DestinationPath .\atov-release.zip -Force
```
