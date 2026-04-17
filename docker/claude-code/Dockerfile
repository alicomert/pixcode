FROM docker/sandbox-templates:claude-code

USER root
COPY shared/install-pixcode.sh /tmp/install-pixcode.sh
RUN chmod +x /tmp/install-pixcode.sh && /tmp/install-pixcode.sh

USER agent
RUN npm install -g pixcode && pixcode --version

COPY --chown=agent:agent shared/start-pixcode.sh /home/agent/.pixcode-start.sh
RUN echo '. ~/.pixcode-start.sh' >> /home/agent/.bashrc
