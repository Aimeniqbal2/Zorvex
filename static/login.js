function initLogin() {
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
        window.location.href = '/';
    }

    // Load saved username and password if exists
    const savedUser = localStorage.getItem('remembered_username');
    const savedPass = localStorage.getItem('remembered_password');
    if (savedUser) {
        usernameInput.value = savedUser;
        if (savedPass) passwordInput.value = savedPass;
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
            localStorage.setItem('remembered_password', credentials.password);
        } else {
            localStorage.removeItem('remembered_username');
            localStorage.removeItem('remembered_password');
        }

        try {
            // Talk directly to our robust Django APIs
            const response = await fetch('/api/auth/login/', {
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
                
                // Trigger a beautiful global loader before redirect
                const loader = document.getElementById('globalLoader');
                if (loader) loader.classList.add('active');
                
                setTimeout(() => {
                    window.location.href = '/';
                }, 800); // 800ms for smooth load display
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

    // Modal Logic
    const forgotBtn = document.getElementById('forgotBtn');
    const forgotModal = document.getElementById('forgotModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    if (forgotBtn && forgotModal && closeModalBtn) {
        forgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            forgotModal.classList.add('active');
        });

        closeModalBtn.addEventListener('click', () => {
            forgotModal.classList.remove('active');
        });

        // Close when clicking outside modal box
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) {
                forgotModal.classList.remove('active');
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogin);
} else {
    initLogin();
}

