// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";

import {AssetRegistry} from "../src/AssetRegistry.sol";
import {BorrowingBaseEngine} from "../src/BorrowingBaseEngine.sol";
import {CertificationAttestor} from "../src/CertificationAttestor.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {PAICertificate} from "../src/PAICertificate.sol";

contract Deploy is Script {
    struct Config {
        address admin;
        address borrower;
        address lender;
        address[3] certifiers;
    }

    struct Deployment {
        AssetRegistry registry;
        PAICertificate certificate;
        CertificationAttestor attestor;
        BorrowingBaseEngine engine;
        MockUSDC usdc;
        CollateralVault vault;
    }

    error InvalidConfiguration();
    error DuplicateParticipant(address participant);
    error UnsupportedChain(uint256 chainId);
    error WiringMismatch();

    function run() external returns (Deployment memory deployment) {
        _requireSupportedChain();
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        Config memory config = Config({
            admin: vm.envAddress("ADMIN_ADDRESS"),
            borrower: vm.envAddress("BORROWER_ADDRESS"),
            lender: vm.envAddress("LENDER_ADDRESS"),
            certifiers: [
                vm.envAddress("CERTIFIER_REVENUE_ADDRESS"),
                vm.envAddress("CERTIFIER_RIGHTS_ADDRESS"),
                vm.envAddress("CERTIFIER_SERVICE_ADDRESS")
            ]
        });

        vm.startBroadcast(privateKey);
        deployment = _deploy(deployer, config);
        vm.stopBroadcast();
        _writeMetadata(deployer, config, deployment);
    }

    /// @dev Test entry point. The script contract acts as temporary admin.
    function deploy(Config memory config) public returns (Deployment memory) {
        _requireSupportedChain();
        return _deploy(address(this), config);
    }

    function _deploy(address temporaryAdmin, Config memory config)
        private
        returns (Deployment memory deployment)
    {
        _validate(temporaryAdmin, config);
        deployment.registry = new AssetRegistry(temporaryAdmin);
        deployment.certificate = new PAICertificate(deployment.registry, temporaryAdmin);
        deployment.attestor =
            new CertificationAttestor(deployment.registry, deployment.certificate, temporaryAdmin);
        deployment.engine = new BorrowingBaseEngine();
        deployment.usdc = new MockUSDC();
        deployment.vault = new CollateralVault(
            deployment.registry, deployment.certificate, deployment.engine, deployment.usdc
        );

        deployment.registry
            .grantRole(deployment.registry.ATTESTOR_ROLE(), address(deployment.attestor));
        deployment.registry.grantRole(deployment.registry.VAULT_ROLE(), address(deployment.vault));
        deployment.certificate
            .grantRole(deployment.certificate.ISSUER_ROLE(), address(deployment.attestor));
        for (uint256 i; i < 3; ++i) {
            deployment.attestor
                .grantRole(deployment.attestor.CERTIFIER_ROLE(), config.certifiers[i]);
        }

        if (config.admin != temporaryAdmin) {
            _transferAdministration(deployment, temporaryAdmin, config.admin);
        }
        _assertWiring(deployment);
    }

    function _transferAdministration(
        Deployment memory deployment,
        address temporaryAdmin,
        address admin
    ) private {
        bytes32 adminRole = deployment.registry.DEFAULT_ADMIN_ROLE();
        deployment.registry.grantRole(adminRole, admin);
        deployment.registry.grantRole(deployment.registry.PAUSER_ROLE(), admin);
        deployment.certificate.grantRole(adminRole, admin);
        deployment.attestor.grantRole(adminRole, admin);

        deployment.registry.revokeRole(deployment.registry.PAUSER_ROLE(), temporaryAdmin);
        deployment.registry.revokeRole(adminRole, temporaryAdmin);
        deployment.certificate.revokeRole(adminRole, temporaryAdmin);
        deployment.attestor.revokeRole(adminRole, temporaryAdmin);
    }

    function _validate(address temporaryAdmin, Config memory config) private pure {
        address[7] memory participants = [
            temporaryAdmin,
            config.admin,
            config.borrower,
            config.lender,
            config.certifiers[0],
            config.certifiers[1],
            config.certifiers[2]
        ];
        for (uint256 i; i < participants.length; ++i) {
            if (participants[i] == address(0)) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (participants[i] == participants[j]) {
                    revert DuplicateParticipant(participants[i]);
                }
            }
        }
    }

    function _requireSupportedChain() private view {
        if (block.chainid != 31_337 && block.chainid != 421_614) {
            revert UnsupportedChain(block.chainid);
        }
    }

    function _assertWiring(Deployment memory deployment) private view {
        if (
            address(deployment.certificate.registry()) != address(deployment.registry)
                || address(deployment.attestor.registry()) != address(deployment.registry)
                || address(deployment.attestor.certificate()) != address(deployment.certificate)
                || address(deployment.vault.registry()) != address(deployment.registry)
                || address(deployment.vault.certificate()) != address(deployment.certificate)
                || address(deployment.vault.engine()) != address(deployment.engine)
                || address(deployment.vault.token()) != address(deployment.usdc)
        ) revert WiringMismatch();
    }

    function _writeMetadata(address deployer, Config memory config, Deployment memory deployment)
        private
    {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "deployer", deployer);
        vm.serializeAddress(key, "admin", config.admin);
        vm.serializeAddress(key, "borrower", config.borrower);
        vm.serializeAddress(key, "lender", config.lender);
        vm.serializeAddress(key, "certifierRevenue", config.certifiers[0]);
        vm.serializeAddress(key, "certifierRights", config.certifiers[1]);
        vm.serializeAddress(key, "certifierService", config.certifiers[2]);
        vm.serializeAddress(key, "assetRegistry", address(deployment.registry));
        vm.serializeAddress(key, "paiCertificate", address(deployment.certificate));
        vm.serializeAddress(key, "certificationAttestor", address(deployment.attestor));
        vm.serializeAddress(key, "borrowingBaseEngine", address(deployment.engine));
        vm.serializeAddress(key, "mockUsdc", address(deployment.usdc));
        string memory json = vm.serializeAddress(key, "collateralVault", address(deployment.vault));
        string memory directory = string.concat(vm.projectRoot(), "/deployments");
        vm.createDir(directory, true);
        vm.writeJson(json, string.concat(directory, "/", vm.toString(block.chainid), ".json"));
    }
}
