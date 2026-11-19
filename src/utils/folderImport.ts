export interface ImportedFileItem {
  file: File;
  relativePath: string;
  folderName: string | null;
}

function getFolderNameFromPath(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  // Immediate parent folder of the audio file becomes the playlist name
  return parts[parts.length - 2];
}

export function normalizeInputFiles(fileList: FileList | File[]): ImportedFileItem[] {
  return Array.from(fileList).map((file) => {
    const rel = file.webkitRelativePath || file.name;
    return {
      file,
      relativePath: rel,
      folderName: getFolderNameFromPath(rel),
    };
  });
}

async function readDirectoryEntries(
  dirEntry: FileSystemDirectoryEntry
): Promise<FileSystemEntry[]> {
  const reader = dirEntry.createReader();
  const allEntries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    allEntries.push(...batch);
  }

  return allEntries;
}

async function traverseEntry(
  entry: FileSystemEntry,
  prefix = ''
): Promise<ImportedFileItem[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    const rel = prefix ? `${prefix}/${file.name}` : file.name;
    return [
      {
        file,
        relativePath: rel,
        folderName: getFolderNameFromPath(rel),
      },
    ];
  }

  if (entry.isDirectory) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
    const nested = await Promise.all(
      children.map((child) => traverseEntry(child, nextPrefix))
    );
    return nested.flat();
  }

  return [];
}

export async function collectDroppedItems(
  dataTransfer: DataTransfer
): Promise<ImportedFileItem[]> {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => Boolean(e));

  if (entries.length > 0) {
    const results = await Promise.all(entries.map((entry) => traverseEntry(entry)));
    return results.flat();
  }

  return normalizeInputFiles(dataTransfer.files);
}
