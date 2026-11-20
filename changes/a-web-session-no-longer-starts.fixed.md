**A web session no longer starts with `package-lock.json` changed.** The session-start hook installed with
`npm install`, which rewrote the lockfile in the layout of the container's npm; npm 10.9 dropped 48 `libc` lines a
newer npm had written. It now runs `npm ci`, which installs the lockfile as it is. (#788)
