# dockerfile amd46

FROM node



RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev\
    librsvg2-dev

RUN curl https://sh.rustup.rs -sSf | \
    sh -s -- --default-toolchain nightly -y

RUN "npm i"

# RUN rustup target add x86_64-unknown-linux-gnu # add the target for the specific architecture

CMD npm run tauri dev

