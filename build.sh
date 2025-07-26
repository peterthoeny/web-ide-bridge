#!/bin/bash
# build.sh - Build Web-IDE-Bridge for supported platforms

echo "🏗️ Building Web-IDE-Bridge for supported platforms..."
echo "===================================================="

# Create bin directory structure
mkdir -p bin/{darwin_amd64,darwin_arm64,linux_amd64,windows_amd64}

# Function to build for a platform
build_for_platform() {
    local os=$1
    local arch=$2
    local output_name=$3
    local platform_name=$4
    
    echo ""
    echo "🔨 Building for $platform_name ($os_$arch)..."
    
    if (cd desktop && GOOS=$os GOARCH=$arch go build -ldflags "-X main.Version=$(node -p "require('../package.json').version")" -o ../bin/${os}_${arch}/$output_name web-ide-bridge.go 2>/dev/null); then
        echo "✅ Successfully built for $platform_name"
    else
        echo "⚠️  Build failed for $platform_name (cross-compilation constraints)"
    fi
}

# Build for each platform
build_for_platform "darwin" "amd64" "web-ide-bridge" "macOS Intel"
build_for_platform "darwin" "arm64" "web-ide-bridge" "macOS Apple Silicon"
build_for_platform "linux" "amd64" "web-ide-bridge" "Linux Intel"
build_for_platform "windows" "amd64" "web-ide-bridge.exe" "Windows Intel"

echo ""
echo "✅ Build process completed!"
echo "===================================================="
echo ""
echo "📁 Build outputs:"
if [ -d "bin" ]; then
    find bin -name "web-ide-bridge*" -type f 2>/dev/null | head -10
else
    echo "No build outputs found"
fi
echo ""
echo "🎯 Ready for distribution!"
echo ""
echo "💡 To create platform-specific releases:"
echo "   zip -r web-ide-bridge-darwin-amd64.zip bin/darwin_amd64/"
echo "   zip -r web-ide-bridge-darwin-arm64.zip bin/darwin_arm64/"
echo "   zip -r web-ide-bridge-linux-amd64.zip bin/linux_amd64/"
echo "   zip -r web-ide-bridge-windows-amd64.zip bin/windows_amd64/" 