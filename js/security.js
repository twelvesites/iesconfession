const correctPassword = "aravind41416!"; 

function checkPasswordAndDisplayContent() {
    // Check if the password was already entered before
    if (localStorage.getItem("passwordEntered") === "true") {
        showContent();
        return;
    }

    // Prompt for password
    const enteredPassword = prompt("Enter password:");

    if (enteredPassword === correctPassword) {
        localStorage.setItem("passwordEntered", "true");
        showContent();
    } else {
        alert("Wrong password.");

        if (window.history.length > 1) {
            // If there's a previous page, go back
            window.history.back();
        } else {
            // If no previous page, try to close
            window.open('', '_self');
            window.close();

            // If still open (blocked by browser), show blank page
            if (!window.closed) {
                window.location.href = "about:blank";
            }
        }
    }
}

function showContent() {
    const contentDiv = document.getElementById("content");
    contentDiv.classList.remove("hidden");
}

// Run the check on page load
window.onload = checkPasswordAndDisplayContent;
