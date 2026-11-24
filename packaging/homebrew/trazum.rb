# Written by scripts/homebrew-formula.mjs from the tarball npm serves. Not edited by hand.
class Trazum < Formula
  desc "Prices AI agent usage from the logs on this machine, offline"
  homepage "https://trazum.vercel.app"
  url "https://registry.npmjs.org/@trazum/cli/-/cli-3.0.6.tgz"
  sha256 "ed292e75551e41ffca34b02378dadf96fe362c61cd8c684a48a786de1ea974fc"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/trazum --version")
  end
end
