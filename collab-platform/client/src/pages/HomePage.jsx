import React from 'react';
import { Link } from 'react-router-dom';

const HomePage = () => {
    return (
        <div className="homepage">
            {/* --- Hero Section --- */}
            <section className="hero-section">
                <div className="hero-background">
                    <div className="glowing-orb orb1"></div>
                    <div className="glowing-orb orb2"></div>
                </div>
                <div className="hero-content">
                    <div className="hero-logo">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 18L12 22L16 18" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 6L12 2L8 6" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 2V22" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
                            <path d="M3 10C3 10 3 12 5 12C7 12 7 10 7 10" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
                            <path d="M17 14C17 14 17 16 19 16C21 16 21 14 21 14" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
                        </svg>
                        <h1>CodeCollab</h1>
                    </div>
                    <h2 className="hero-tagline">
                        Where Developers Sync, Build, and Achieve.
                    </h2>
                    <p className="hero-description">
                        The all-in-one collaborative platform designed for coders. Stop juggling tools and start building.
                        Real-time IDEs, live chat, and AI skill-tracking—all in one place.
                    </p>
                    <div className="hero-cta">
                        <Link to="/register" className="btn">Get Started for Free</Link>
                        <Link to="/login" className="btn btn-secondary">Login</Link>
                    </div>
                </div>
            </section>

            {/* --- Features ("About") Section --- */}
            <section className="features-section">
                <h2>A Unified Workflow for Modern Teams</h2>
                <div className="feature-grid">
                    
                    <div className="feature-card">
                        <h3>Real-time Collaborative IDE</h3>
                        <p>Code together in a shared, multi-file environment. See live cursors, edit simultaneously, and run your code in a cloud sandbox. It's like Google Docs, but for your entire project.</p>
                    </div>

                    <div className="feature-card">
                        <h3>AI Skill Assessment</h3>
                        <p>Move beyond guesswork. Our AI-powered assessment system challenges you with dynamic questions, tracks your mastery over time, and implements skill-decay to keep you sharp.</p>
                    </div>

                    <div className="feature-card">
                        <h3>Integrated Team Rooms</h3>
                        <p>Ditch the extra tabs. Every project lives in a "Room" complete with persistent group chat, real-time notifications, and project management tools. All your context, all in one place.</p>
                    </div>

                </div>
            </section>
        </div>
    );
};

export default HomePage;