class AiProvider < Formula
  desc "Manage multiple AI providers (Claude API, LiteLLM, Claude.ai) for Claude Code"
  homepage "https://github.com/MikeLeonFox/ai-provider-cli"
  url "https://github.com/MikeLeonFox/ai-provider-cli/archive/refs/tags/v1.0.3.tar.gz"
  sha256 "238081bdd5b1baea603295ad071e06e6f569a020a7befe79f507ab5f3b1976a0"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install"
    system "npm", "run", "build"
    chmod 0755, "dist/index.js"
    libexec.install Dir["*"]
    (bin/"aic").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/index.js" "$@"
    SH
  end

  test do
    assert_match "1.0.3", shell_output("#{bin}/aic --version")
  end
end
