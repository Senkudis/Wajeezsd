import React, { useState, useEffect } from 'react';
import axios from 'axios';

// IMPORTANT: Install axios first if you haven't: npm install axios
// Ensure your API_URL is configured (e.g., http://localhost:5000/api)

const WhatsAppSubscriptionModal = ({ user, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Logic to check if we should show the modal
        const shouldShow = () => {
            if (!user) return false;

            // 1. Check if user is already subscribed
            if (user.isWhatsappSubscribed) return false;

            // 2. Check session storage for dismissal
            const isDismissed = sessionStorage.getItem('whatsapp_prompt_dismissed');
            if (isDismissed) return false;

            return true;
        };

        if (shouldShow()) {
            // Small delay for better UX
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [user]);

    const handleSubscribe = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token'); // Assuming JWT is in localStorage

            // Call Backend API
            await axios.post('/api/auth/toggle-notification',
                { enable: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Optional: Call Bot directly to welcome (Or let backend do it)
            // But Backend is safer.

            alert('Great! You will now receive updates on WhatsApp.');
            setIsVisible(false);
            if (onClose) onClose();
        } catch (error) {
            console.error('Subscription error:', error);
            alert('Failed to subscribe. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = () => {
        sessionStorage.setItem('whatsapp_prompt_dismissed', 'true');
        setIsVisible(false);
        if (onClose) onClose();
    };

    if (!isVisible) return null;

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.iconContainer}>
                    <img
                        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                        alt="WhatsApp"
                        style={styles.icon}
                    />
                </div>
                <h2 style={styles.title}>Get Instant Updates!</h2>
                <p style={styles.text}>
                    Don't miss out! Would you like to receive real-time trip updates and OTPs directly on your WhatsApp?
                </p>

                <div style={styles.buttonGroup}>
                    <button
                        onClick={handleDismiss}
                        style={styles.cancelButton}
                        disabled={loading}
                    >
                        Maybe Later
                    </button>
                    <button
                        onClick={handleSubscribe}
                        style={styles.confirmButton}
                        disabled={loading}
                    >
                        {loading ? 'Subscribing...' : 'Yes, Enable WhatsApp'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Inline Styles (You can replace with CSS/Tailwind)
const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
    },
    modal: {
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '20px',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.3s ease-out'
    },
    iconContainer: {
        marginBottom: '20px'
    },
    icon: {
        width: '60px',
        height: '60px'
    },
    title: {
        margin: '0 0 10px 0',
        color: '#333',
        fontSize: '24px',
        fontWeight: 'bold'
    },
    text: {
        margin: '0 0 25px 0',
        color: '#666',
        lineHeight: '1.5'
    },
    buttonGroup: {
        display: 'flex',
        gap: '10px',
        justifyContent: 'center'
    },
    cancelButton: {
        padding: '12px 20px',
        border: '1px solid #ddd',
        borderRadius: '10px',
        backgroundColor: 'white',
        color: '#666',
        cursor: 'pointer',
        fontSize: '16px',
        transition: 'all 0.2s'
    },
    confirmButton: {
        padding: '12px 20px',
        border: 'none',
        borderRadius: '10px',
        backgroundColor: '#25D366',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '16px',
        transition: 'all 0.2s',
        boxShadow: '0 4px 10px rgba(37, 211, 102, 0.3)'
    }
};

export default WhatsAppSubscriptionModal;
