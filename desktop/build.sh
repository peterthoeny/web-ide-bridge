#!/bin/bash

# @name            Web-IDE-Bridge / Desktop
# @tagline         Build script for Web-IDE-Bridge desktop application
# @file            desktop/build.sh
# @version         1.1.3
# @release         2025-07-30
# @repository      https://github.com/peterthoeny/web-ide-bridge
# @author          Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
# @copyright       2025 Peter Thoeny, https://twiki.org & https://github.com/peterthoeny/
# @license         GPL v3, see LICENSE file
# @genai           99%, Cursor 1.2, Claude Sonnet 4

# Check if we're in the correct directory
if [ ! -f "web-ide-bridge.go" ] || [ ! -f "go.mod" ]; then
    echo "❌ Error: build.sh must be run from the desktop/ directory"
    echo ""
    echo "Current directory: $(pwd)"
    echo "Expected files: web-ide-bridge.go, go.mod"
    echo ""
    echo "💡 To fix this:"
    echo "   cd desktop"
    echo "   ./build.sh"
    echo ""
    echo "   Or from project root:"
    echo "   cd desktop && ./build.sh"
    exit 1
fi

echo "🏗️ Building Web-IDE-Bridge for supported platforms..."
echo "===================================================="

# Create bin directory structure in project root (one level up)
mkdir -p ../bin/{darwin_amd64,darwin_arm64,linux_amd64,windows_amd64}

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
        if (go build $build_flags -o ../bin/${os}_${arch}/$output_name web-ide-bridge.go); then
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
        if (GOOS=$os GOARCH=$arch go build $build_flags -o ../bin/${os}_${arch}/$output_name web-ide-bridge.go 2>/dev/null); then
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
    build_for_platform "windows" "amd64" "Web-IDE-Bridge.exe" "Windows Intel" "-ldflags -H=windowsgui"
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

    # Clean up any existing app bundles in current directory
    if [ -d "Web-IDE-Bridge.app" ]; then
        rm -rf Web-IDE-Bridge.app
    fi

    # Find fyne command
    FYNE_CMD=""
    if command -v fyne &> /dev/null; then
        FYNE_CMD="fyne"
    elif [ -f "$HOME/go/bin/fyne" ]; then
        FYNE_CMD="$HOME/go/bin/fyne"
    else
        echo "⚠️  fyne tool not found. Install with: go install fyne.io/tools/cmd/fyne@latest"
        echo "💡 Tip: Add ~/go/bin to your PATH for easier access"
    fi

    if [ -n "$FYNE_CMD" ]; then
        # Create app bundle for current macOS architecture
        if [ "$CURRENT_ARCH" = "amd64" ] || [ "$CURRENT_ARCH" = "arm64" ]; then
            # Check if the binary exists before creating app bundle
            if [ ! -f "../bin/darwin_${CURRENT_ARCH}/web-ide-bridge" ]; then
                echo "❌ Binary not found: ../bin/darwin_${CURRENT_ARCH}/web-ide-bridge"
                echo "   Cannot create app bundle without the binary"
                return 1
            fi

            echo "   Using fyne command: $FYNE_CMD"
            echo "   Target executable: ../bin/darwin_${CURRENT_ARCH}/web-ide-bridge"

            # Try to create app bundle with retry logic
            MAX_RETRIES=3
            RETRY_COUNT=0
            SUCCESS=false

            while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
                if [ $RETRY_COUNT -gt 0 ]; then
                    echo "   Retry attempt $RETRY_COUNT of $MAX_RETRIES..."
                    sleep 1
                fi

                if ($FYNE_CMD package --name "Web-IDE-Bridge" --app-id "com.peterthoeny.web-ide-bridge" --app-version "$(node -p "require('../package.json').version")" --icon assets/web-ide-bridge.png --use-raw-icon --executable ../bin/darwin_${CURRENT_ARCH}/web-ide-bridge web-ide-bridge.go); then
                    echo "✅ Successfully created macOS app bundle for $CURRENT_ARCH"
                    SUCCESS=true

                    # Move app bundle to platform-specific directory and clean up
                    if [ -d "Web-IDE-Bridge.app" ]; then
                        # Remove existing app bundle if it exists
                        if [ -d "../bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app" ]; then
                            rm -rf ../bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app
                        fi
                        mv Web-IDE-Bridge.app ../bin/darwin_${CURRENT_ARCH}/
                        echo "📦 App bundle moved to ../bin/darwin_${CURRENT_ARCH}/Web-IDE-Bridge.app"
                    else
                        echo "⚠️  Warning: App bundle directory not found after creation"
                        SUCCESS=false
                    fi

                    # Final cleanup - remove any app bundles that might have been created after move
                    if [ -d "Web-IDE-Bridge.app" ]; then
                        rm -rf Web-IDE-Bridge.app
                        echo "🧹 Cleaned up leftover app bundle in desktop directory"
                    fi
                else
                    echo "   Attempt $((RETRY_COUNT + 1)) failed"
                    RETRY_COUNT=$((RETRY_COUNT + 1))

                    # Clean up any partial app bundle
                    if [ -d "Web-IDE-Bridge.app" ]; then
                        rm -rf Web-IDE-Bridge.app
                        echo "   Cleaned up partial app bundle"
                    fi
                fi
            done

            if [ "$SUCCESS" = false ]; then
                echo "❌ Failed to create macOS app bundle for $CURRENT_ARCH after $MAX_RETRIES attempts"
                echo "   This might be due to:"
                echo "   - File system permissions"
                echo "   - Insufficient disk space"
                echo "   - Fyne tool issues"
                echo "   - Temporary file conflicts"
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
if [ -d "../bin" ]; then
    find ../bin -name "web-ide-bridge*" -type f 2>/dev/null | head -10
else
    echo "No build outputs found"
fi
echo ""
echo "🎯 Ready for distribution!"
echo ""
echo "💡 To create platform-specific releases:"
echo "   cd .. # (execute in project root)"
echo "   zip    bin/web-ide-bridge-darwin-amd64.zip  bin/darwin_amd64/web-ide-bridge"
echo "   zip -r bin/Web-IDE-Bridge-App-amd64.zip     bin/darwin_amd64/Web-IDE-Bridge.app/"
echo "   zip    bin/web-ide-bridge-darwin-arm64.zip  bin/darwin_arm64/web-ide-bridge"
echo "   zip -r bin/Web-IDE-Bridge-App-arm64.zip     bin/darwin_arm64/Web-IDE-Bridge.app/"
echo "   zip    bin/web-ide-bridge-linux-amd64.zip   bin/linux_amd64/web-ide-bridge"
echo "   zip    bin/Web-IDE-Bridge-windows-amd64.zip bin/windows_amd64/Web-IDE-Bridge.exe"
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
