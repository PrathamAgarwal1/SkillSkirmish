import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const RegisterPage = () => {
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const { register } = useContext(AuthContext);
    const navigate = useNavigate();

    const { username, email, password } = formData;
    const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async e => {
        e.preventDefault();
        await register(formData);
        navigate('/'); // Redirect to home after register
    };

    return (
        <div className="container">
            <h1>Register</h1>
            <form onSubmit={onSubmit}>
                <input type="text" name="username" value={username} onChange={onChange} placeholder="Username" required />
                <input type="email" name="email" value={email} onChange={onChange} placeholder="Email" required />
                <input type="password" name="password" value={password} onChange={onChange} placeholder="Password" required minLength="6" />
                <input type="submit" className="btn" value="Register" />
            </form>
        </div>
    );
};
export default RegisterPage;