FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash ca-certificates git sudo \
    && useradd --create-home --gid operator --shell /bin/bash operator \
    && printf 'operator ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/operator \
    && chmod 0440 /etc/sudoers.d/operator \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=operator:operator --from=dotfiles / /opt/fixtures/dotfiles/
COPY --chown=operator:operator --from=pi_tools / /opt/fixtures/pi-tools/
COPY --chown=operator:operator --from=study_room / /opt/fixtures/study-room/
COPY tests/workstation/smoke.sh /usr/local/bin/workstation-smoke
COPY tests/workstation/wslpath /usr/local/bin/wslpath
COPY tests/workstation/powershell.exe /usr/local/bin/powershell.exe

RUN chmod +x /usr/local/bin/workstation-smoke \
        /usr/local/bin/wslpath /usr/local/bin/powershell.exe

USER operator
WORKDIR /home/operator
ENV HOME=/home/operator
ENV SHELL=/bin/bash
ENV WSL_DISTRO_NAME=Ubuntu-24.04
ENV DOTFILES_REPO=/opt/fixtures/dotfiles
ENV PI_TOOLS_REPO=/opt/fixtures/pi-tools
ENV STUDY_ROOM_REPO=/opt/fixtures/study-room

RUN git config --global user.name 'Workstation Smoke' \
    && git config --global user.email 'smoke@example.invalid' \
    && for repo in dotfiles pi-tools study-room; do \
        git -C "/opt/fixtures/$repo" init; \
        git -C "/opt/fixtures/$repo" add -A; \
        git -C "/opt/fixtures/$repo" commit -m fixture; \
    done

CMD ["workstation-smoke"]
