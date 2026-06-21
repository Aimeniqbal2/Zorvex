document.addEventListener("DOMContentLoaded", () => {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            if(targetId === "") return;
            const targetElement = document.getElementById(targetId);
            if(targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Video Player interaction
    const videoWrapper = document.getElementById('videoWrapper');
    const introVideo = document.getElementById('introVideo');
    const videoOverlay = document.querySelector('.video-overlay');
    const placeholderImg = document.querySelector('.video-placeholder-img');
    const closeVideoBtn = document.getElementById('closeVideoBtn');

    if (videoWrapper && introVideo) {
        // Only trigger play when clicking the overlay (not the video controls or close button)
        videoOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            introVideo.style.display = 'block';
            videoOverlay.style.display = 'none';
            placeholderImg.style.display = 'none';
            if (closeVideoBtn) closeVideoBtn.style.display = 'flex';
            introVideo.play();
            
            // Remove mask and border to make the video full screen inside the wrapper
            videoWrapper.style.maskImage = 'none';
            videoWrapper.style.webkitMaskImage = 'none';
            videoWrapper.style.border = 'none';
        });

        if (closeVideoBtn) {
            closeVideoBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling
                introVideo.pause();
                introVideo.currentTime = 0; // Reset video
                
                // Hide video and close button, show placeholder and play button
                introVideo.style.display = 'none';
                closeVideoBtn.style.display = 'none';
                videoOverlay.style.display = 'flex';
                placeholderImg.style.display = 'block';
                
                // Restore wrapper styles (fade out and borders)
                videoWrapper.style.maskImage = '';
                videoWrapper.style.webkitMaskImage = '';
                videoWrapper.style.border = '';
            });
        }
    }

    // Black Hole Particles Animation
    const initBlackHoleParticles = (container) => {
        if (!container) return;
        const createParticle = () => {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            
            // Random size between 1px and 3px
            const size = Math.random() * 2 + 1;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            // Random angle and distance
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 500 + 200; // Start between 200px and 700px away from center

            const startX = 720 + Math.cos(angle) * distance; // 720 is center X of 1440px container
            const startY = 405 + Math.sin(angle) * distance; // 405 is center Y of 810px container

            particle.style.left = `${startX}px`;
            particle.style.top = `${startY}px`;
            
            // Initial transform
            particle.style.transform = `scale(0)`;
            particle.style.opacity = '0';
            
            container.appendChild(particle);

            // Animate after a brief timeout to allow DOM to register initial state
            setTimeout(() => {
                const duration = Math.random() * 2000 + 2000; // 2-4 seconds
                particle.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 1, 1), opacity ${duration/2}ms ease-in, left ${duration}ms cubic-bezier(0.2, 0, 1, 1), top ${duration}ms cubic-bezier(0.2, 0, 1, 1)`;
                
                // Animate towards center
                particle.style.left = `720px`;
                particle.style.top = `405px`;
                particle.style.transform = `scale(1)`;
                particle.style.opacity = '1';

                // Shrink and fade at the very end as it gets absorbed
                setTimeout(() => {
                    particle.style.transition = `transform 500ms ease, opacity 500ms ease`;
                    particle.style.transform = `scale(0)`;
                    particle.style.opacity = '0';
                    
                    setTimeout(() => {
                        particle.remove();
                    }, 500);
                }, duration - 500);
            }, 50);
        };

        // Continually spawn particles
        setInterval(createParticle, 100);
    };

    initBlackHoleParticles(document.getElementById('particles-container'));
    initBlackHoleParticles(document.getElementById('particles-container-bottom'));

    // Rising Particles Animation for Superpowers Section
    const risingParticlesContainer = document.getElementById('rising-particles-container');
    if (risingParticlesContainer) {
        const createRisingParticle = () => {
            const particle = document.createElement('div');
            particle.classList.add('rising-particle');
            
            const size = Math.random() * 2 + 1;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            // Start near the bottom center, but with random X spread
            const startX = 50 + (Math.random() * 60 - 30); // Random % between 20% and 80% width
            const startY = 100; // Bottom of container
            
            particle.style.left = `${startX}%`;
            particle.style.top = `${startY}%`;
            
            risingParticlesContainer.appendChild(particle);

            setTimeout(() => {
                const duration = Math.random() * 3000 + 3000; // 3-6 seconds
                const endY = startY - (Math.random() * 40 + 40); // Move up by 40-80%
                
                // Float left or right slightly as it goes up
                const endX = startX + (Math.random() * 10 - 5); 

                particle.style.transition = `top ${duration}ms linear, left ${duration}ms ease-in-out, opacity ${duration/2}ms ease-in-out`;
                
                particle.style.top = `${endY}%`;
                particle.style.left = `${endX}%`;
                particle.style.opacity = '1'; // Fade in

                setTimeout(() => {
                    particle.style.transition = `opacity 1000ms ease`;
                    particle.style.opacity = '0'; // Fade out at end
                    setTimeout(() => particle.remove(), 1000);
                }, duration - 1000);
            }, 50);
        };

        setInterval(createRisingParticle, 150);
    }
});
