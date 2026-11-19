# Written by scripts/homebrew-formula.mjs from the tarball npm serves. Not edited by hand.
class Trazum < Formula
  desc "Prices AI agent usage from the logs on this machine, offline"
  homepage "https://trazum.vercel.app"
  url "https://registry.npmjs.org/@trazum/cli/-/cli-3.0.0.tgz"
  sha256 "d334f005d3d4eaad49ed1c89722246bfcb25a1e2c43a62d04811b303150d8fea"
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
