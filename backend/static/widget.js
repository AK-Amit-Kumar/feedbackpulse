(function () {
  const API_URL = "http://localhost:8000";

  function createWidget(projectId) {

    // --- Build the container ---
    const container = document.createElement("div");
    container.id = "fp-widget";
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      padding: 20px;
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 9999;
      border: 1px solid #f0f0f0;
    `;

    // --- Build the inner HTML ---
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <p style="margin:0; font-weight:600; font-size:15px; color:#1a1a2e;">
          Share your feedback
        </p>
        <button id="fp-close" style="background:none; border:none; font-size:18px; cursor:pointer; color:#888;">
          ×
        </button>
      </div>
      <textarea
        id="fp-content"
        rows="3"
        placeholder="What's on your mind?"
        style="
          width: 100%;
          padding: 10px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          resize: none;
          box-sizing: border-box;
          font-family: inherit;
          outline: none;
        "
      ></textarea>
      <button id="fp-submit" style="
        margin-top: 10px;
        width: 100%;
        padding: 10px;
        background: #4F46E5;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 500;
      ">
        Submit feedback
      </button>
      <p id="fp-msg" style="
        margin: 8px 0 0;
        font-size: 13px;
        color: #0F6E56;
        display: none;
        text-align: center;
      ">
        Thanks for your feedback! 🎉
      </p>
      <p id="fp-err" style="
        margin: 8px 0 0;
        font-size: 13px;
        color: #A32D2D;
        display: none;
        text-align: center;
      ">
        Something went wrong. Please try again.
      </p>
    `;

    // --- Add widget to the page ---
    document.body.appendChild(container);

    // --- Close button ---
    document.getElementById("fp-close").addEventListener("click", function () {
      container.style.display = "none";
    });

    // --- Submit button ---
    document.getElementById("fp-submit").addEventListener("click", async function () {

      const content = document.getElementById("fp-content").value.trim();
      const successMsg = document.getElementById("fp-msg");
      const errorMsg = document.getElementById("fp-err");
      const submitBtn = document.getElementById("fp-submit");

      // Basic validation
      if (!content) {
        document.getElementById("fp-content").style.borderColor = "#E24B4A";
        return;
      }

      // Disable button while submitting
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      try {
        const response = await fetch(`${API_URL}/feedback/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_id: projectId,
            content: content,
          }),
        });

        if (response.ok) {
          // Success
          successMsg.style.display = "block";
          errorMsg.style.display = "none";
          document.getElementById("fp-content").value = "";
          submitBtn.textContent = "Submit feedback";
          submitBtn.disabled = false;
        } else {
          throw new Error("Server returned " + response.status);
        }

      } catch (err) {
        // Error
        errorMsg.style.display = "block";
        successMsg.style.display = "none";
        submitBtn.textContent = "Submit feedback";
        submitBtn.disabled = false;
        console.error("FeedbackPulse error:", err);
      }
    });
  }

  // Expose the init function globally
  window.FeedbackPulse = { init: createWidget };

})();