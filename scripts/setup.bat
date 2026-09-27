@echo off
:: Baton 一键安装脚本
:: 功能：创建桌面快捷方式 + 首次启动
:: 说明：应用入口统一为打包产物 release\win-unpacked\Baton.exe；
::       开机自启请在应用「设置」页开启（写入 HKCU\...\CurrentVersion\Run）。

set "PROJECT_DIR=%~dp0.."
cd /d "%PROJECT_DIR%"

set "APP_EXE=%PROJECT_DIR%\release\win-unpacked\Baton.exe"

echo ========================================
echo   Baton 一键安装
echo ========================================
echo.

:: 1. 检查打包产物
if not exist "%APP_EXE%" (
    echo [提示] 未找到打包产物，正在构建（首次构建需要数分钟）...
    where npm >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 未找到 npm，无法自动构建。
        echo         请安装 Node.js 后重新运行本脚本，或直接使用 release 目录中已有的产物。
        pause
        exit /b 1
    )
    call npm run build:electron:dir
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 构建失败
        pause
        exit /b 1
    )
    echo [提示] 构建产物位于临时目录，请将其中的 win-unpacked 复制到 release 目录后再运行本脚本。
    pause
    exit /b 1
)
echo [完成] 已找到应用：%APP_EXE%

:: 2. 创建桌面快捷方式
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Baton.lnk"
echo [进度] 创建桌面快捷方式...
powershell -NoProfile -Command ^
    "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%SHORTCUT%'); $SC.TargetPath='%APP_EXE%'; $SC.WorkingDirectory='%PROJECT_DIR%\release\win-unpacked'; $SC.IconLocation='%APP_EXE%'; $SC.Save()"
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 快捷方式创建失败
    pause
    exit /b 1
)
echo [完成] 桌面快捷方式已创建

:: 3. 选择是否现在启动
echo.
set /p STARTNOW="现在启动 Baton？[Y/n]: "
if /i "%STARTNOW%"=="n" goto :end

echo [进度] 启动 Baton...
start "" "%APP_EXE%"
echo [完成] Baton 已启动（窗口关闭时会最小化到系统托盘）

:end
echo.
echo ========================================
echo  安装完成！
echo  双击桌面 "Baton" 图标启动
echo  开机自启：应用内「设置」页开启
echo ========================================
pause
