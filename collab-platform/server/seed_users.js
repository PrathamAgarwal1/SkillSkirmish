const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const skillsList = [
    'JavaScript', 'Python', 'Java', 'C++', 'Rubik\'s Cube', // Added for fun
    'React', 'Node.js', 'Angular', 'Vue', 'Django', 'Flask', 'Spring Boot',
    'Docker', 'Kubernetes', 'AWS', 'Go', 'Rust', 'TypeScript'
];

const firstNames = [
    'Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan', 'Jamie', 'Reese', 'Quinn', 'Skyler', 'Riley',
    'Charlie', 'Peyton', 'Avery', 'Parker', 'Cameron', 'Dakota', 'Hayden', 'Rowan', 'Sawyer', 'Emerson',
    'Liam', 'Noah', 'Oliver', 'Elijah', 'William', 'James', 'Benjamin', 'Lucas', 'Henry', 'Alexander',
    'Olivia', 'Emma', 'Ava', 'Charlotte', 'Sophia', 'Amelia', 'Isabella', 'Mia', 'Evelyn', 'Harper'
];

const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
];

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateUser = () => {
    const fName = getRandomElement(firstNames);
    const lName = getRandomElement(lastNames);
    const username = `${fName}${lName}${getRandomInt(10, 999)}`;
    const email = `${username.toLowerCase()}@example.com`;

    // Generate 1-5 skills
    const numSkills = getRandomInt(1, 5);
    const userSkills = [];
    const usedSkills = new Set();

    for (let i = 0; i < numSkills; i++) {
        let skillName = getRandomElement(skillsList);
        while (usedSkills.has(skillName)) {
            skillName = getRandomElement(skillsList);
        }
        usedSkills.add(skillName);

        const elo = getRandomInt(800, 2800);
        userSkills.push({
            name: skillName,
            mastery: getRandomInt(10, 100),
            elo: elo,
            matchesPlayed: getRandomInt(5, 50),
            isProvisional: false,
            history: [{
                eloChange: 0,
                newElo: elo,
                date: new Date(Date.now() - getRandomInt(0, 30) * 24 * 60 * 60 * 1000)
            }]
        });
    }

    return {
        username,
        email,
        password: 'password123', // Will be hashed by pre-save hook
        bio: `Software Developer passionate about ${userSkills[0].name}.`,
        role: 'developer', // Assuming default role logic exists or defaults
        skills: userSkills,
        location: getRandomElement(['New York', 'San Francisco', 'London', 'Berlin', 'Tokyo', 'Remote']),
        company: getRandomElement(['TechCorp', 'Google', 'Meta', 'StartupInc', 'Freelance', '']),
        socialLinks: {
            github: `https://github.com/${username}`,
            linkedin: `https://linkedin.com/in/${username}`,
            portfolio: `https://${username}.dev`
        }
    };
};

const seedUsers = async () => {
    await connectDB();

    const users = [];
    for (let i = 0; i < 50; i++) {
        users.push(generateUser());
    }

    console.log(`Creating ${users.length} users...`);

    try {
        // Individual save to trigger pre-save hooks (password hashing)
        let successCount = 0;
        for (const u of users) {
            // Check if user exists (mock check, but unique constraint will throw)
            try {
                const newUser = new User(u);
                await newUser.save();
                successCount++;
                if (successCount % 10 === 0) console.log(`Created ${successCount} users...`);
            } catch (err) {
                if (err.code === 11000) {
                    // duplicate key error, ignore
                    console.log(`Skipping duplicate: ${u.username}`);
                } else {
                    console.error(`Error creating ${u.username}:`, err.message);
                }
            }
        }
        console.log(`Seed complete. Added ${successCount} new users.`);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedUsers();
