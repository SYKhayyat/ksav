# Linux installers (.deb + .AppImage) built through Docker.
#
# A .deb cannot be cross-built from Windows, but Docker over WSL gives a real
# Linux userland on the same machine, so no CI runner is needed for this one.
# (macOS still is: a .dmg can only be produced on macOS — see
# .github/workflows/release.yml.)
#
# Ubuntu 22.04 on purpose, not a newer release: glibc is backward but not forward
# compatible, so a binary linked against 22.04's glibc runs on 22.04 and
# everything newer. Building on 24.04 would silently drop every user still on an
# older distro.
#
# Usage:  ksav/packaging/build-linux.sh

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# webkit2gtk is the webview Tauri renders into; librsvg and patchelf are what the
# .deb and .AppImage bundlers need. `file` is not incidental — the AppImage
# tooling shells out to it and fails obscurely when it is missing.
#
# Ayatana only: `libappindicator3-dev` and `libayatana-appindicator3-dev` declare
# a Conflicts on each other, so asking for both fails the whole apt transaction.
# Ayatana is the maintained fork and the one Tauri looks for first.
RUN apt-get update && apt-get install -y \
      libwebkit2gtk-4.1-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      patchelf \
      build-essential \
      curl \
      wget \
      file \
      libssl-dev \
      libgtk-3-dev \
      ca-certificates \
      desktop-file-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /work

# The build itself lives in the entrypoint rather than a RUN layer, so the source
# is bind-mounted at run time and this image stays a reusable toolchain.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
