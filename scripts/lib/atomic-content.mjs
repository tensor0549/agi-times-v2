import fs from 'node:fs';

export function restoreContentSnapshot(snapshot) {
  for (const [file, raw] of Object.entries(snapshot)) {
    if (raw == null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, raw);
  }
}
