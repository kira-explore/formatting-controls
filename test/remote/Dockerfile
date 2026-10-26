FROM ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server ca-certificates curl tar gzip libstdc++6 && rm -rf /var/lib/apt/lists/* && useradd --create-home --shell /bin/bash fc && passwd -d fc && mkdir -p /run/sshd /home/fc/.ssh && chmod 700 /home/fc/.ssh && chown -R fc:fc /home/fc/.ssh && ssh-keygen -A
RUN printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'AllowUsers fc' >> /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
