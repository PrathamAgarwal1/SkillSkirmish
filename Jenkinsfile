pipeline {
    agent any

    stages {

        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Build Backend Image') {
            steps {
                dir('collab-platform/server') {
                    sh 'docker build -t skillskirmish-server .'
                }
            }
        }

        stage('Deploy Backend') {
            steps {
                sh '''
                docker stop skillskirmish-server || true
                docker rm skillskirmish-server || true
                docker run -d \
                  --name skillskirmish-server \
                  -e PORT=5000 \
                  -p 5000:5000 \
                  skillskirmish-server
                '''
            }
        }

        stage('Build Frontend Image') {
            steps {
                dir('collab-platform/client') {
                    sh 'docker build -t skillskirmish-client .'
                }
            }
        }

        stage('Deploy Frontend') {
            steps {
                sh '''
                docker stop skillskirmish-client || true
                docker rm skillskirmish-client || true
                docker run -d \
                  --name skillskirmish-client \
                  -p 3000:80 \
                  skillskirmish-client
                '''
            }
        }
    }
}
