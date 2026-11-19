# Written by scripts/homebrew-formula.mjs from the tarball npm serves. Not edited by hand.
class Trazum < Formula
  desc "Prices AI agent usage from the logs on this machine, offline"
  homepage "https://trazum.vercel.app"
  url "https://registry.npmjs.org/@trazum/cli/-/cli-3.0.1.tgz"
  sha256 "59eb2a96c430896ba55000a6004f19eac1c30c00ea107f999ebe5e6e1c39079a"
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
