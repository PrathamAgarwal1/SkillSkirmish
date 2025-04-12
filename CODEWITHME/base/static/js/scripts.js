let loginModalActive = false;
let signupModalActive = false;

document.addEventListener("DOMContentLoaded", function() {
    // Modal elements
    const loginModal = document.getElementById("loginModal");
    const signupModal = document.getElementById("signupModal");
    const mainContent = document.getElementById("mainContent");

    // Modal toggle functions
    window.toggleLogin = function() {
        console.log("Login toggle triggered");
        signupModal.style.display = 'none';
        loginModal.style.display = loginModal.style.display === 'flex' ? 'none' : 'flex';
        updateBlurEffect();
    };

    window.toggleSignup = function() {
        console.log("Signup toggle triggered");
        loginModal.style.display = 'none';
        signupModal.style.display = signupModal.style.display === 'flex' ? 'none' : 'flex';
        updateBlurEffect();
    };

    // Update blur effect helper
    function updateBlurEffect() {
        if (loginModal.style.display === 'flex' || signupModal.style.display === 'flex') {
            mainContent.classList.add("blurred");
        } else {
            mainContent.classList.remove("blurred");
        }
    }

    // Close modals when clicking outside
    window.addEventListener("click", function(e) {
        if (e.target.classList.contains('modal')) {
            loginModal.style.display = 'none';
            signupModal.style.display = 'none';
            updateBlurEffect();
        }
    });

    // Prevent modal content clicks from closing
    const modalBoxes = document.querySelectorAll(".login-box, .auth-box");
    modalBoxes.forEach(box => {
        box.addEventListener("click", function(e) {
            e.stopPropagation();
        });
    });

    // Auto-show modals if needed
    const bodyElement = document.body;
    if (bodyElement.dataset.openLogin === "true") toggleLogin();
    if (bodyElement.dataset.openSignup === "true") toggleSignup();
});
