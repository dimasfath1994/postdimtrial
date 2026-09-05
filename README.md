# postdim
api tools development


## VS Code Extension

The repository includes a VS Code Webview extension that reuses the frontend in
`www/`. To test it locally:

```bash
npm install
npm run package
```

Then open the generated `.vsix` file in VS Code with **Extensions: Install from
VSIX...**. After installation, run **Postdim: Open API Client** from the
Command Palette.

The extension scaffold and packaging metadata are in the repository root. The
publisher value in `package.json` must match a publisher created at
`marketplace.visualstudio.com/manage` before publishing.


for tagging:

git tag v1.4.1
git push origin v1.4.1