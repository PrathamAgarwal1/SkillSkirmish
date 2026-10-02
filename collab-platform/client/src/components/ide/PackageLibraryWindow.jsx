import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Package browser. Suggestions come from the server for the project's stack; installs run inside
 * the project's sandbox (npm for Node projects, pip for Python/ML) and are saved to
 * package.json / requirements.txt so teammates and deploys get them too.
 */
const PackageLibraryWindow = ({ projectType = 'React App', projectId, onPackageInstalled, installedPackages = [], installer }) => {
    const [packages, setPackages] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [installing, setInstalling] = useState({});
    const [message, setMessage] = useState('');

    useEffect(() => {
        axios.get(`/api/execute/packages/${encodeURIComponent(projectType)}`)
            .then(res => setPackages(res.data.packages || []))
            .catch(() => setPackages([]));
    }, [projectType]);

    const filteredPackages = packages.filter(pkg =>
        pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pkg.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleInstallPackage = async (packageName) => {
        const name = packageName.trim();
        if (!name) return;
        setInstalling(prev => ({ ...prev, [name]: true }));
        setMessage(`Installing ${name}… (output in the Console)`);
        try {
            // In browser mode the IDE installs into its in-browser runtime instead of the server sandbox
            const res = installer
                ? { data: await installer(name) }
                : await axios.post('/api/execute/install-package', { projectId, packageName: name });
            if (res.data.success) {
                onPackageInstalled && onPackageInstalled(name);
                setMessage(`✓ ${name} installed`);
            } else {
                setMessage(`✕ ${res.data.message}`);
            }
        } catch (err) {
            setMessage(`✕ ${err.response?.data?.message || err.message}`);
        } finally {
            setInstalling(prev => ({ ...prev, [name]: false }));
        }
    };

    const isInstalled = (packageName) => installedPackages.includes(packageName);
    // Typing a name that isn't in the list offers a direct install
    const customName = searchTerm.trim();
    const showCustom = customName && !packages.some(p => p.name === customName);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="window-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 0, overflow: 'hidden' }}>
                <div className="package-search" style={{ flexShrink: 0 }}>
                    <input
                        type="text"
                        placeholder="Search, or type any package name to install…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && showCustom && handleInstallPackage(customName)}
                    />
                </div>
                {message && (
                    <div style={{ padding: '6px 12px', fontSize: 12, color: message.startsWith('✕') ? 'var(--gh-f48771)' : message.startsWith('✓') ? 'var(--gh-6a9955)' : 'var(--gh-cccccc)' }}>
                        {message}
                    </div>
                )}
                <div className="package-list" style={{ flex: 1, overflow: 'auto' }}>
                    {showCustom && (
                        <div className="package-item">
                            <div className="package-name">{customName}</div>
                            <div className="package-description">Install this package by name</div>
                            <div className="package-actions">
                                <button className="package-btn" onClick={() => handleInstallPackage(customName)} disabled={installing[customName]}>
                                    {installing[customName] ? 'Installing...' : 'Install'}
                                </button>
                            </div>
                        </div>
                    )}

                    {filteredPackages.length === 0 && !showCustom ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--gh-999999)' }}>No packages found</div>
                    ) : (
                        filteredPackages.map((pkg) => (
                            <div key={pkg.name} className="package-item">
                                <div className="package-name">{pkg.name}</div>
                                <div className="package-version">Version: {pkg.version}</div>
                                <div className="package-description">{pkg.description}</div>
                                <div className="package-actions">
                                    <button
                                        className={`package-btn ${isInstalled(pkg.name) ? 'installed' : ''}`}
                                        onClick={() => handleInstallPackage(pkg.name)}
                                        disabled={installing[pkg.name] || isInstalled(pkg.name)}
                                    >
                                        {installing[pkg.name] ? 'Installing...' : isInstalled(pkg.name) ? '✓ Installed' : 'Install'}
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
