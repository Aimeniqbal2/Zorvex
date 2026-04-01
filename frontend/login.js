document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');
    const loginBtn = document.getElementById('loginBtn');
    const minimalCard = document.querySelector('.minimal-card');

    const rememberMeCheckbox = document.getElementById('rememberMe');
    const togglePassword = document.getElementById('togglePassword');

    // 1. Instantly check if user is already authenticated
    if(localStorage.getItem('access_token')) {
        window.location.href = 'dashboard.html';
    }

    // Load saved username if exists
    const savedUser = localStorage.getItem('remembered_username');
    if (savedUser) {
        usernameInput.value = savedUser;
        rememberMeCheckbox.checked = true;
    }

    // Toggle Password Visibility
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.textContent = type === 'password' ? 'Show' : 'Hide';
    });

    // 2. Intercept Login Submission natively
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Trigger UI Loading state magically
        errorMsg.style.opacity = '0';
        errorMsg.textContent = '';
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
        loginBtn.disabled = true;

        const credentials = {
            username: usernameInput.value.trim(),
            password: passwordInput.value,
            remember_me: rememberMeCheckbox.checked
        };

        // Save username locally if remember me is checked
        if (rememberMeCheckbox.checked) {
            localStorage.setItem('remembered_username', credentials.username);
        } else {
            localStorage.removeItem('remembered_username');
        }

        try {
            // Talk directly to our robust Django APIs
            const response = await fetch('http://127.0.0.1:8000/api/auth/login/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (response.ok) {
                // Success! Store the Secure JWT Tokens
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                
                // Trigger a beautiful outward fade animation before redirect
                minimalCard.style.transform = 'scale(0.95)';
                minimalCard.style.opacity = '0';
                
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 400); // 400ms CSS match
            } else {
                showError(data.detail || 'Access Denied. Account expired or invalid credentials.');
                triggerShake();
            }
        } catch (err) {
            showError('Network disconnection. Is the Django Server alive?');
            triggerShake();
        } finally {
            if(!localStorage.getItem('access_token')) {
                // Reset button state on failure
                btnText.style.display = 'inline-block';
                btnLoader.style.display = 'none';
                loginBtn.disabled = false;
            }
        }
    });

    // Magic Error Handlers
    function showError(text) {
        errorMsg.textContent = text;
        errorMsg.style.opacity = '1';
    }

    // Small native vibration effect
    function triggerShake() {
        minimalCard.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-15px) rotate(-1deg)' },
            { transform: 'translateX(15px) rotate(1deg)' },
            { transform: 'translateX(-10px)' },
            { transform: 'translateX(10px)' },
            { transform: 'translateX(0)' }
        ], { duration: 500, easing: 'ease-in-out' });
    }
});
