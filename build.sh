#!/bin/bash
# build.sh - Build Web-IDE-Bridge for supported platforms

echo "🏗️ Building Web-IDE-Bridge for supported platforms..."
echo "===================================================="

# Create bin directory structure
mkdir -p bin/{darwin_amd64,darwin_arm64,linux_amd64,windows_amd64}

# Get current platform info
CURRENT_OS=$(go env GOOS)
CURRENT_ARCH=$(go env GOARCH)

echo "📍 Current platform: $CURRENT_OS/$CURRENT_ARCH"

# Function to build for a platform
build_for_platform() {
    local os=$1
    local arch=$2
    local output_name=$3
    local platform_name=$4
    local build_flags=$5

    echo ""
    echo "🔨 Building for $platform_name ($os/$arch)..."

    # Check if we're building for the current platform
    if [ "$os" = "$CURRENT_OS" ] && [ "$arch" = "$CURRENT_ARCH" ]; then
        echo "✅ Building for current platform"
        if (cd desktop && go build $build_flags -o ../bin/${os}_${arch}/$output_name web-ide-bridge.go); then
            echo "✅ Successfully built for $platform_name"
            return 0
        else
            echo "❌ Build failed for $platform_name"
            return 1
        fi
    else
        echo "⚠️  Cross-compilation attempted for $platform_name"
        echo "   Note: GUI applications with native dependencies (like Fyne) have cross-compilation constraints."
        echo "   This build will likely fail due to platform-specific GUI libraries."
        if (cd desktop && GOOS=$os GOARCH=$arch go build $build_flags -o ../bin/${os}_${arch}/$output_name web-ide-bridge.go 2>/dev/null); then
            echo "✅ Successfully built for $platform_name (unexpected success!)"
            return 0
        else
            echo "❌ Cross-compilation failed for $platform_name (expected)"
            echo "   💡 To build for $platform_name, you need to build on a $platform_name system"
            return 1
        fi
    fi
}

# Build for each platform with appropriate flags
echo ""
echo "📦 Building binaries..."

# Build for current platform only (cross-compilation doesn't work for GUI apps)
if [ "$CURRENT_OS" = "darwin" ]; then
    # macOS - build for current architecture only
    if [ "$CURRENT_ARCH" = "amd64" ]; then
        build_for_platform "darwin" "amd64" "web-ide-bridge" "macOS Intel" ""
    elif [ "$CURRENT_ARCH" = "arm64" ]; then
        build_for_platform "darwin" "arm64" "web-ide-bridge" "macOS Apple Silicon" ""
    fi
elif [ "$CURRENT_OS" = "linux" ]; then
    # Linux - build for current architecture
    build_for_platform "linux" "amd64" "web-ide-bridge" "Linux Intel" ""
elif [ "$CURRENT_OS" = "windows" ]; then
    # Windows - build for current architecture
    build_for_platform "windows" "amd64" "web-ide-bridge.exe" "Windows Intel" "-ldflags -H=windowsgui"
else
    echo "⚠️  Unknown platform: $CURRENT_OS/$CURRENT_ARCH"
    echo "   Attempting generic build..."
    build_for_platform "$CURRENT_OS" "$CURRENT_ARCH" "web-ide-bridge" "$CURRENT_OS $CURRENT_ARCH" ""
fi

# Note: Cross-compilation is not attempted because GUI applications with native
# dependencies (like Fyne) cannot be cross-compiled, even between macOS architectures.

# Create macOS app bundle if on macOS and fyne is available
if [ "$CURRENT_OS" = "darwin" ]; then
    echo ""
    echo "🍎 Creating macOS app bundle..."

    # Clean up any existing app bundles in desktop directory
    if [ -d "desktop/Web-IDE-Bridge.app" ]; then
        rm -rf desktop/Web-IDE-Bridge.app
    fi

    # Find fyne command
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
        # Create app bundle for current macOS architecture
        if [ "$CURRENT_ARCH" = "amd64" ] || [ "$CURRENT_ARCH" = "arm64" ]; then
            if (cd desktop && $FYNE_CMD package --name "Web-IDE-Bridge" --app-id "com.peterthoeny.web-ide-bridge" --app-version "$(node -p "require('../package.json').version")" --icon assets/web-ide-bridge.png --use-raw-icon --executable ../bin/darwin_${CURRENT_ARCH}/web-ide-bridge web-ide-bridge.go 2>/dev/null); then
                echo "✅ Successfully created macOS app bundle for $CURRENT_ARCH"
                # Move app bundle to platform-specific directory and clean up
                if [ -d "desktop/Web-IDE-Bridge.app" ]; then
                    # Remove existing app bundle if it exists
                    if [ -d "bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app" ]; then
                        rm -rf bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app
                    fi
                    mv desktop/Web-IDE-Bridge.app bin/darwin_${CURRENT_ARCH}/
                    echo "📦 App bundle moved to bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app"
                fi
                # Final cleanup - remove any app bundles that might have been created after move
                if [ -d "desktop/Web-IDE-Bridge.app" ]; then
                    rm -rf desktop/Web-IDE-Bridge.app
                    echo "🧹 Cleaned up leftover app bundle in desktop directory"
                fi
            else
                echo "⚠️  Failed to create macOS app bundle for $CURRENT_ARCH"
            fi
        fi
    fi
else
    echo ""
    echo "🍎 Skipping macOS app bundle creation (not on macOS)"
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
echo ""
echo "⚠️  IMPORTANT: Cross-Platform Build Limitations"
echo "================================================"
echo "GUI applications with native dependencies (like Fyne) cannot be reliably"
echo "cross-compiled. This is a fundamental limitation of Go's GUI libraries."
echo ""
echo "To build for all platforms, you need to:"
echo "1. Build on macOS Intel for macOS Intel builds"
echo "2. Build on macOS Apple Silicon for macOS ARM64 builds"
echo "3. Build on Linux for Linux builds"
echo "4. Build on Windows for Windows builds"
echo ""
echo "💡 Alternative: Use CI/CD with multiple runners for true cross-platform builds"
