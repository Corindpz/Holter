deploy-front:
	cd front && npm run deploy
	git add src/api/static/
	git commit -m "chore: deploy front build to static"
	git push origin feature/holter-pms-v1
