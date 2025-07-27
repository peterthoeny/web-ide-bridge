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

# Create macOS app bundle if fyne is available
echo ""
echo "🍎 Creating macOS app bundle..."

# Clean up any existing app bundles in desktop directory
if [ -d "desktop/Web-IDE-Bridge.app" ]; then
    rm -rf desktop/Web-IDE-Bridge.app
fi
FYNE_CMD=""
if command -v fyne &> /dev/null; then
    FYNE_CMD="fyne"
elif command -v ~/go/bin/fyne &> /dev/null; then
    FYNE_CMD="~/go/bin/fyne"
else
    echo "⚠️  fyne tool not found. Install with: go install fyne.io/tools/cmd/fyne@latest"
    echo "💡 Tip: Add ~/go/bin to your PATH for easier access"
fi

if [ -n "$FYNE_CMD" ]; then
    if (cd desktop && $FYNE_CMD package --name "Web-IDE-Bridge" --app-id "com.peterthoeny.web-ide-bridge" --app-version "$(node -p "require('../package.json').version")" --icon assets/web-ide-bridge.png --use-raw-icon --executable ../bin/darwin_amd64/web-ide-bridge web-ide-bridge.go 2>/dev/null); then
        echo "✅ Successfully created macOS app bundle"
        # Move app bundle to platform-specific directory and clean up
        if [ -d "desktop/Web-IDE-Bridge.app" ]; then
            # Remove existing app bundle if it exists
            if [ -d "bin/darwin_amd64/Web-IDE-Bridge.app" ]; then
                rm -rf bin/darwin_amd64/Web-IDE-Bridge.app
            fi
            mv desktop/Web-IDE-Bridge.app bin/darwin_amd64/
            echo "📦 App bundle moved to bin/darwin_amd64/Web-IDE-Bridge.app"
        fi
        # Final cleanup - remove any app bundles that might have been created after move
        if [ -d "desktop/Web-IDE-Bridge.app" ]; then
            rm -rf desktop/Web-IDE-Bridge.app
            echo "🧹 Cleaned up leftover app bundle in desktop directory"
        fi
    else
        echo "⚠️  Failed to create macOS app bundle"
    fi
fi

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