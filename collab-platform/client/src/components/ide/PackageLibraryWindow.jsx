import React, { useState, useEffect } from 'react';

const PackageLibraryWindow = ({ projectType = 'React App', projectId, onPackageInstalled, installedPackages = [] }) => {
    const [packages, setPackages] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [installing, setInstalling] = useState({});

    useEffect(() => {
        // Load popular packages based on project type
        const loadPopularPackages = () => {
            const popularPackages = {
                'React App': [
                    { name: 'react-router-dom', version: '6.x', description: 'Routing library for React', category: 'routing' },
                    { name: 'axios', version: '1.x', description: 'HTTP client library', category: 'http' },
                    { name: 'redux', version: '4.x', description: 'State management', category: 'state' },
                    { name: 'tailwindcss', version: '3.x', description: 'Utility-first CSS framework', category: 'styling' },
                    { name: 'react-query', version: '3.x', description: 'Data fetching & caching', category: 'data' },
                    { name: 'zustand', version: '4.x', description: 'Lightweight state management', category: 'state' },
                    { name: 'framer-motion', version: '10.x', description: 'Animation library', category: 'animation' },
                    { name: 'react-hook-form', version: '7.x', description: 'Form state management', category: 'forms' },
                ],
                'Node.js API': [
                    { name: 'express', version: '4.x', description: 'Web framework', category: 'framework' },
                    { name: 'mongoose', version: '7.x', description: 'MongoDB ODM', category: 'database' },
                    { name: 'cors', version: '2.x', description: 'CORS middleware', category: 'middleware' },
                    { name: 'dotenv', version: '16.x', description: 'Environment variables', category: 'config' },
                    { name: 'jsonwebtoken', version: '9.x', description: 'JWT authentication', category: 'auth' },
                    { name: 'bcryptjs', version: '2.x', description: 'Password hashing', category: 'security' },
                    { name: 'socket.io', version: '4.x', description: 'Real-time communication', category: 'realtime' },
                    { name: 'multer', version: '1.x', description: 'File upload middleware', category: 'files' },
                ],
                'Python Script': [
                    { name: 'requests', version: '2.x', description: 'HTTP library', category: 'http' },
                    { name: 'flask', version: '2.x', description: 'Web framework', category: 'framework' },
                    { name: 'django', version: '4.x', description: 'Full web framework', category: 'framework' },
                    { name: 'pandas', version: '2.x', description: 'Data analysis', category: 'data' },
                    { name: 'numpy', version: '1.x', description: 'Numerical computing', category: 'data' },
                    { name: 'matplotlib', version: '3.x', description: 'Plotting library', category: 'visualization' },
                    { name: 'beautifulsoup4', version: '4.x', description: 'Web scraping', category: 'scraping' },
                    { name: 'sqlalchemy', version: '2.x', description: 'ORM library', category: 'database' },
                ],
                'Static HTML/CSS': [
                    { name: 'bootstrap', version: '5.x', description: 'CSS framework', category: 'framework' },
                    { name: 'animate.css', version: '4.x', description: 'Animation library', category: 'animation' },
                    { name: 'font-awesome', version: '6.x', description: 'Icon library', category: 'icons' },
                ]
            };
            setPackages(popularPackages[projectType] || []);
        };
        loadPopularPackages();
    }, [projectType]);

    const filteredPackages = packages.filter(pkg =>
        pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleInstallPackage = async (packageName) => {
        setInstalling(prev => ({ ...prev, [packageName]: true }));

        try {
            const response = await fetch('/api/execute/install-package', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    packageName,
                    projectType
                })
            });

            if (response.ok) {
                onPackageInstalled && onPackageInstalled(packageName);
                alert(`✓ ${packageName} installed successfully!`);
            } else {
                alert(`Failed to install ${packageName}`);
            }
        } catch (error) {
            alert(`Error installing package: ${error.message}`);
        } finally {
            setInstalling(prev => ({ ...prev, [packageName]: false }));
        }
    };

    const isInstalled = (packageName) => {
        return installedPackages.includes(packageName);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="window-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 0, overflow: 'hidden' }}>
                <div className="package-search" style={{ flexShrink: 0 }}>
                    <input
                        type="text"
                        placeholder="Search packages..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="package-list" style={{ flex: 1, overflow: 'auto' }}>
                    {/* Special Init Button for MERN Stack Empty Projects */}
                    {projectType === 'MERN Stack' && (
                        <div style={{ padding: '10px', borderBottom: '1px solid #3e3e42', marginBottom: '10px' }}>
                            <button
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#238636',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                                onClick={async () => {
                                    if (window.confirm('Initialize MERN Template? This will add starter files.')) {
                                        try {
                                            const response = await fetch(`/api/projects/${projectId}/restore-template`, {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'x-auth-token': localStorage.getItem('token') // Use token from storage for auth
                                                },
                                                body: JSON.stringify({ templateName: 'MERN-Template' })
                                            });
                                            if (response.ok) {
                                                alert('Template Initialized! Refresh the IDE to see files.');
                                                // Ideally trigger file refresh here
                                                window.location.reload();
                                            } else {
                                                alert('Failed to initialize template');
                                            }
                                        } catch (e) {
                                            alert('Error: ' + e.message);
                                        }
                                    }
                                }}
                            >
                                ⚡ Initialize MERN Starter Files
                            </button>
                        </div>
                    )}

                    {filteredPackages.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                            No packages found
                        </div>
                    ) : (
                        filteredPackages.map((pkg, idx) => (
                            <div key={idx} className="package-item">
                                <div className="package-name">{pkg.name}</div>
                                <div className="package-version">Version: {pkg.version}</div>
                                <div className="package-description">{pkg.description}</div>
                                <div className="package-actions">
                                    <button
                                        className={`package-btn ${isInstalled(pkg.name) ? 'installed' : ''}`}
                                        onClick={() => handleInstallPackage(pkg.name)}
                                        disabled={installing[pkg.name] || isInstalled(pkg.name)}
                                    >
                                        {installing[pkg.name]
                                            ? 'Installing...'
                                            : isInstalled(pkg.name)
                                                ? '✓ Installed'
                                                : 'Install'}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default PackageLibraryWindow;
