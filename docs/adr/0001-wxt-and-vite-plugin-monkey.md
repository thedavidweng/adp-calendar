# Build the extension with WXT and the userscript with vite-plugin-monkey

Both clients share one pure parser package, so both are built on Vite: WXT for the Manifest V3 extension and vite-plugin-monkey for the Tampermonkey userscript, in a pnpm workspace. Plasmo was rejected because its last release (v0.90.5) was May 2025 and it is built on Parcel, which would split the toolchain.
