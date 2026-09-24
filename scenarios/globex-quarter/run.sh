# The whole quarter from nothing, then the package: zsh run.sh (about 45 minutes; see README.md).
source ${0:A:h}/lib.sh
zsh $S/setup.sh && zsh $S/phase1b.sh \
  && zsh $S/onboard.sh maya maya-gx sam-gx 2026-06-24T11:00:00Z "MacBook Pro 14 (macOS 26)" \
  && zsh $S/onboard.sh sam sam-gx maya-gx 2026-06-25T15:00:00Z "Framework 13 (Fedora 44)" \
  && zsh $S/quarter.sh && zsh $S/post.sh && zsh $S/finish.sh
