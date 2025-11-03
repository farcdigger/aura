// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {XAnimalNFT} from "../src/XAnimalNFT.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        XAnimalNFT nft = new XAnimalNFT(
            deployer,
            "Aura Creatures",
            "AURAC"
        );
        
        console.log("Contract deployed at:", address(nft));
        console.log("Owner:", deployer);
        
        vm.stopBroadcast();
    }
}

