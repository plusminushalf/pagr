cask "pagr" do
  version "0.0.11"
  sha256 "589cd8b696aea3748c1c6618aee0c13c1ce4df59de8003f58c71a5432e718af6"

  url "https://github.com/plusminushalf/pagr/releases/download/v#{version}/pagr-#{version}-arm64.dmg"
  name "pagr"
  desc "Tiny markdown viewer and editor for folders"
  homepage "https://github.com/plusminushalf/pagr"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"
  depends_on arch: :arm64

  app "pagr.app"
  # Shipped by forge.config.ts via `extraResource: ['bin/pagr']`. Brew
  # symlinks it onto the user's PATH, so `pagr ~/notes` works from the
  # terminal after install.
  binary "#{appdir}/pagr.app/Contents/Resources/pagr", target: "pagr"

  # The build is ad-hoc signed but not notarized. macOS quarantines the DMG
  # on download, which otherwise triggers "pagr is damaged and can't be
  # opened" on first launch. Stripping the quarantine xattr downgrades it
  # to the standard unsigned-developer dialog users can bypass.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/pagr.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/pagr",
    "~/Library/Preferences/com.electron.pagr.plist",
    "~/Library/Saved Application State/com.electron.pagr.savedState",
  ]
end
