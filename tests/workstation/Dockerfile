FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates git sudo \
    && useradd --create-home --gid operator --shell /bin/bash operator \
    && printf 'operator ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/operator \
    && chmod 0440 /etc/sudoers.d/operator \
    && rm -rf /var/lib/apt/lists/*

COPY --from=dotfiles / /home/operator/dotfiles/
COPY --from=pi_tools / /home/operator/pi-tools/
COPY tests/workstation/smoke.sh /usr/local/bin/workstation-smoke
COPY tests/workstation/wslpath /usr/local/bin/wslpath
COPY tests/workstation/powershell.exe /usr/local/bin/powershell.exe

RUN chown -R operator:operator /home/operator/dotfiles /home/operator/pi-tools \
    && chmod +x /usr/local/bin/workstation-smoke \
        /usr/local/bin/wslpath /usr/local/bin/powershell.exe

USER operator
WORKDIR /home/operator
ENV HOME=/home/operator
ENV SHELL=/bin/bash
ENV WSL_DISTRO_NAME=Ubuntu-24.04
ENV PI_TOOLS_DIR=/home/operator/pi-tools

CMD ["workstation-smoke"]
