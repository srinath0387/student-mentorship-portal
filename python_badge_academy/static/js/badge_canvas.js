/**
 * Badge Certificate Generator & High-Resolution PNG Exporter
 * Renders a certificate card on an HTML5 Canvas and exports crisp PNGs.
 */

window.BadgeCanvas = {
  renderBadgeCard(badge, studentName, canvasElement) {
    const canvas = canvasElement;
    const ctx = canvas.getContext("2d");

    // Standard high-res certificate dimensions
    const width = 1200;
    const height = 800;
    canvas.width = width;
    canvas.height = height;

    // Background fill
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Decorative gradient outer border
    const borderGrad = ctx.createLinearGradient(0, 0, width, height);
    borderGrad.addColorStop(0, "#4f46e5");
    borderGrad.addColorStop(0.5, "#06b6d4");
    borderGrad.addColorStop(1, "#10b981");

    ctx.lineWidth = 16;
    ctx.strokeStyle = borderGrad;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Inner subtle border
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(36, 36, width - 72, height - 72);

    // Academy Header
    ctx.font = "bold 26px -apple-system, sans-serif";
    ctx.fillStyle = "#4f46e5";
    ctx.textAlign = "center";
    ctx.fillText("🐍 PYTHON BADGE ACADEMY", width / 2, 85);

    ctx.font = "600 16px -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("OFFICIAL CERTIFICATE OF SKILL ACHIEVEMENT", width / 2, 115);

    // Shield Badge Icon
    ctx.save();
    ctx.translate(width / 2, 185);
    // Draw hexagon/shield background
    ctx.beginPath();
    const r = 50;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#e0e7ff";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#6366f1";
    ctx.stroke();

    // Emoji/Icon
    ctx.font = "46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.badge_icon || "🐍", 0, 0);
    ctx.restore();

    // Badge Title
    ctx.font = "bold 34px -apple-system, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(badge.badge_title, width / 2, 280);

    // Awarded To
    ctx.font = "18px -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("Proudly awarded to", width / 2, 320);

    // Student Name
    ctx.font = "bold 44px -apple-system, sans-serif";
    ctx.fillStyle = "#4f46e5";
    ctx.fillText(studentName, width / 2, 375);

    // Score & Completion Date
    const dateStr = badge.issued_at ? new Date(badge.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString();
    ctx.font = "600 20px -apple-system, sans-serif";
    ctx.fillStyle = "#1e293b";
    ctx.fillText(`Evaluation Score: ${badge.score}%   •   Issued: ${dateStr}`, width / 2, 420);

    // Divider Line
    ctx.beginPath();
    ctx.moveTo(width / 2 - 250, 445);
    ctx.lineTo(width / 2 + 250, 445);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Skills Earned Section
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText("PROVEN COMPETENCIES & SKILLS:", width / 2, 480);

    let skills = [];
    if (Array.isArray(badge.skills)) {
      skills = badge.skills;
    } else if (typeof badge.skills_json === "string") {
      try { skills = JSON.parse(badge.skills_json); } catch(e){}
    }

    ctx.font = "16px -apple-system, sans-serif";
    ctx.fillStyle = "#334155";
    const startY = 515;
    skills.slice(0, 5).forEach((skill, idx) => {
      ctx.fillText(`✓  ${skill}`, width / 2, startY + (idx * 28));
    });

    // Verification ID Box at bottom
    ctx.font = "bold 15px -apple-system, monospace";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`VERIFICATION ID: ${badge.verification_id}`, width / 2, 710);

    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Verify authenticity at: pythonbadgeacademy.org/verify", width / 2, 735);
  },

  downloadBadgePNG(badge, studentName) {
    const canvas = document.createElement("canvas");
    this.renderBadgeCard(badge, studentName, canvas);
    const link = document.createElement("a");
    link.download = `Python_Badge_${badge.badge_title.replace(/\s+/g, "_")}_${studentName.replace(/\s+/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
};
