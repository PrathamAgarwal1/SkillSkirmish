let loginModalActive = false;
let signupModalActive = false;

document.addEventListener("DOMContentLoaded", function() {
    // Modal toggle functions
    window.toggleLogin = function() {
        const loginModal = document.getElementById("loginModal");
        const signupModal = document.getElementById("signupModal");
        const mainContent = document.getElementById("mainContent");
        
        console.log("Login toggle triggered");
        
        // Close signup if open
        signupModal.style.display = 'none';
        
        // Toggle login modal
        if (loginModal.style.display === 'flex') {
            loginModal.style.display = 'none';
            mainContent.classList.remove("blurred");
        } else {
            loginModal.style.display = 'flex';
            mainContent.classList.add("blurred");
        }
    }

    window.toggleSignup = function() {
        const loginModal = document.getElementById("loginModal");
        const signupModal = document.getElementById("signupModal");
        const mainContent = document.getElementById("mainContent");
        
        console.log("Signup toggle triggered");
        
        // Close login if open
        loginModal.style.display = 'none';
        
        // Toggle signup modal
        if (signupModal.style.display === 'flex') {
            signupModal.style.display = 'none';
            mainContent.classList.remove("blurred");
        } else {
            signupModal.style.display = 'flex';
            mainContent.classList.add("blurred");
        }
    }

    // Close modals when clicking outside
    window.addEventListener("click", function(e) {
        if (e.target.classList.contains('modal')) {
            const loginModal = document.getElementById("loginModal");
            const signupModal = document.getElementById("signupModal");
            const mainContent = document.getElementById("mainContent");
            
            loginModal.style.display = 'none';
            signupModal.style.display = 'none';
            mainContent.classList.remove("blurred");
        }
    });

    // Prevent modal content clicks from closing
    const modalBoxes = document.querySelectorAll(".login-box, .auth-box");
    modalBoxes.forEach(box => {
        box.addEventListener("click", function(e) {
            e.stopPropagation();
        });
    });

    // Form submission handlers
    const loginForm = document.querySelector("#loginForm");
    const signupForm = document.querySelector("#signupForm");

    if (loginForm) {
        loginForm.addEventListener("submit", async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            
            try {
                const response = await fetch('/login/', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                });
                
                const data = await response.json();
                if (data.success) {
                    showMessage(data.message, 'success');
                    setTimeout(() => window.location.href = '/home/', 1500);
                } else {
                    showMessage(data.message, 'error');
                }
            } catch (error) {
                showMessage('An error occurred', 'error');
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            
            try {
                const response = await fetch('/signup/', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                });
                
                const data = await response.json();
                if (data.success) {
                    showMessage(data.message, 'success');
                    setTimeout(() => window.location.href = '/home/', 1500);
                } else {
                    showMessage(data.message, 'error');
                }
            } catch (error) {
                showMessage('An error occurred', 'error');
            }
        });
    }

    // Message handling
    function showMessage(message, type) {
        const messageContainer = document.createElement('div');
        messageContainer.className = `message ${type}`;
        messageContainer.innerHTML = `
            ${message}
            <span class="close-btn">&times;</span>
        `;
        
        const activeModal = loginModalActive ? 
            document.querySelector('.login-box') : 
            document.querySelector('.signup-box');
        
        if (activeModal) {
            const existingMessage = activeModal.querySelector('.message');
            if (existingMessage) {
                existingMessage.remove();
            }
            activeModal.insertBefore(messageContainer, activeModal.firstChild);
        }

        setTimeout(() => messageContainer.remove(), 5000);
        
        const closeBtn = messageContainer.querySelector('.close-btn');
        closeBtn.onclick = () => messageContainer.remove();
    }

    // CSRF token helper
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Auto-show modals if needed
    const bodyElement = document.body;
    if (bodyElement.dataset.openLogin === "true") toggleLogin();
    if (bodyElement.dataset.openSignup === "true") toggleSignup();
});
