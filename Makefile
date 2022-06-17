.PHONY: install test-keys build start test clean-test-keys stop

TEST_KEY := $(shell solana-keygen pubkey ./tests/test-key.json)

all: install test-keys build start test clean-test-keys stop

install:
	yarn install

test-keys:
	mkdir -p target/deploy
	cp -r tests/test-keypairs/* target/deploy
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/vtmaopgPztD3WrNgYNrGFbtfUkcgVSxk6U8eycqQTPD/$$(solana-keygen pubkey tests/test-keypairs/cardinal_token_manager-keypair.json)/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/vpcKZrRAFr73Ty4W4bFM4xCWhxk1Whd9mHB1uuvFAKQ/$$(solana-keygen pubkey tests/test-keypairs/cardinal_paid_claim_approver-keypair.json)/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/vtiRVcPp7TjXUFgCwFGMDgKLZdbqY4dZJiWKYCv9Gb8/$$(solana-keygen pubkey tests/test-keypairs/cardinal_time_invalidator-keypair.json)/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/useZ65tbyvWpdYCLDJaegGK34Lnsi8S3jZdwx8122qp/$$(solana-keygen pubkey tests/test-keypairs/cardinal_use_invalidator-keypair.json)/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/vpm5Gp95SYVyqwZz5zia5YsUNe7Kd6P7tFCC7GcXGbe/$$(solana-keygen pubkey tests/test-keypairs/cardinal_payment_manager-keypair.json)/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/vcmVnNNod8qTzr3n3WDkDSaSckJF9xYVU8hmtdSjWuX/$$(solana-keygen pubkey tests/test-keypairs/cardinal_collateral_manager-keypair.json)/g" {} +


build:
	anchor build
	yarn idl:generate

start:
	solana-test-validator --url https://api.devnet.solana.com \
		--clone metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s --clone PwDiXFxQsGra4sFFTT8r1QWRMd4vfumiWC1jfWNfdYT \
		--bpf-program ./target/deploy/cardinal_token_manager-keypair.json ./target/deploy/cardinal_token_manager.so \
		--bpf-program ./target/deploy/cardinal_paid_claim_approver-keypair.json ./target/deploy/cardinal_paid_claim_approver.so \
		--bpf-program ./target/deploy/cardinal_time_invalidator-keypair.json ./target/deploy/cardinal_time_invalidator.so \
		--bpf-program ./target/deploy/cardinal_use_invalidator-keypair.json ./target/deploy/cardinal_use_invalidator.so \
		--bpf-program ./target/deploy/cardinal_payment_manager-keypair.json ./target/deploy/cardinal_payment_manager.so \
		--bpf-program ./target/deploy/cardinal_collateral_manager-keypair.json ./target/deploy/cardinal_collateral_manager.so \
		--reset --quiet & echo $$! > validator.PID
	sleep 5
	solana-keygen pubkey ./tests/test-key.json
	solana airdrop 1000 $(TEST_KEY) --url http://localhost:8899

test:
	anchor test --skip-local-validator --skip-build --skip-deploy --provider.cluster localnet

clean-test-keys:
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_token_manager-keypair.json)/vtmaopgPztD3WrNgYNrGFbtfUkcgVSxk6U8eycqQTPD/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_paid_claim_approver-keypair.json)/vpcKZrRAFr73Ty4W4bFM4xCWhxk1Whd9mHB1uuvFAKQ/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_time_invalidator-keypair.json)/vtiRVcPp7TjXUFgCwFGMDgKLZdbqY4dZJiWKYCv9Gb8/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_use_invalidator-keypair.json)/useZ65tbyvWpdYCLDJaegGK34Lnsi8S3jZdwx8122qp/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_payment_manager-keypair.json)/vpm5Gp95SYVyqwZz5zia5YsUNe7Kd6P7tFCC7GcXGbe/g" {} +
	LC_ALL=C find programs src -type f -exec sed -i '' -e "s/$$(solana-keygen pubkey tests/test-keypairs/cardinal_collateral_manager-keypair.json)/vcmVnNNod8qTzr3n3WDkDSaSckJF9xYVU8hmtdSjWuX/g" {} +

stop:
	pkill solana-test-validator