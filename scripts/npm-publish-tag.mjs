import { pathToFileURL } from 'node:url';

// Prereleases must never replace the stable npm channel.
export function publishTag(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error('Invalid package version');
  }
  const prerelease = version.split('+')[0].split('-').slice(1).join('-');
  if (prerelease.split('.').some(part => /^0\d+$/.test(part))) throw new Error('Invalid prerelease identifier');
  return prerelease ? 'next' : 'latest';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(publishTag(process.argv[2]));
}
