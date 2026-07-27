@echo off
REM 摸鱼盯盘 启动脚本（开发模式）
REM 关键：unset ELECTRON_RUN_AS_NODE，否则 electron 会被当成 node 跑导致 ipcMain 报错
cd /d %~dp0
set ELECTRON_RUN_AS_NODE=
REM Electron 内置 Node 不允许 NODE_OPTIONS 里的 --use-system-ca，必须清掉
set NODE_OPTIONS=
call npm run electron:dev
