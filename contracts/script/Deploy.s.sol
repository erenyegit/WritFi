// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {TestBTC} from "../src/TestBTC.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {WritOptions} from "../src/WritOptions.sol";
import {PythAccumulatorAdapter} from "../src/adapters/PythAccumulatorAdapter.sol";

/// @notice Deploys the options market.
///
/// On GIWA Sepolia there is neither a canonical stablecoin nor a wrapped BTC, so
/// the faucet-backed test tokens are reused when their addresses are given and
/// deployed otherwise. On a mainnet, pass the real token addresses: the core
/// refuses anything that is not 6-decimal cash and an 8-decimal underlying.
///
/// Settlement reads Pyth through PythAccumulatorAdapter, which verifies updates
/// against the guardian set Pyth's own upgraded contracts use (read from the
/// Wormhole receiver behind Pyth on Ethereum and Base: guardian set 1, five
/// keys, data source Pythnet chain 26).
///
/// Env:
///   DEPLOYER_PRIVATE_KEY  deployer key; becomes the first maker
///   QUOTE_SIGNER          address that signs the first maker's quotes
///   BTC_USD_FEED_ID       Pyth BTC/USD feed id
///   USDC_ADDRESS          optional, reuse this cash token
///   BTC_ADDRESS           optional, reuse this underlying
///   MAX_PREMIUM_PER_BTC   optional, maker premium cap in USDC (1e6) per BTC
///   OWNER                 optional, hand ownership to this address (a multisig)
///
/// Run:
///   forge script script/Deploy.s.sol --rpc-url giwa_sepolia --broadcast
contract Deploy is Script {
    uint32 constant GUARDIAN_SET_INDEX = 1;
    uint16 constant PYTHNET_CHAIN_ID = 26;
    bytes32 constant PYTHNET_EMITTER =
        0x507974686e6574507974686e6574507974686e6574507974686e657450797468;

    function _guardians() internal pure returns (address[] memory g) {
        g = new address[](5);
        g[0] = 0x41534bB176E461A3fb30479400f210549eCCE638;
        g[1] = 0x6502987B62F21Cab7eb5cCd8f0173084b60d5B41;
        g[2] = 0x44A3e8F6a382412CF6BB90A3F8106e68977476C9;
        g[3] = 0x13Edc776d3063549fdB0702Af182Edc905A539d4;
        g[4] = 0x3af088854bB768065f4929e5BbdfA4Cbb04C9aF9;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address quoteSigner = vm.envAddress("QUOTE_SIGNER");
        bytes32 feedId = vm.envBytes32("BTC_USD_FEED_ID");
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0));
        address btcAddr = vm.envOr("BTC_ADDRESS", address(0));
        uint256 premiumCap = vm.envOr("MAX_PREMIUM_PER_BTC", uint256(10_000e6));
        address owner = vm.envOr("OWNER", address(0));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        if (usdcAddr == address(0)) usdcAddr = address(new TestUSDC());
        if (btcAddr == address(0)) btcAddr = address(new TestBTC());

        PythAccumulatorAdapter adapter = new PythAccumulatorAdapter(
            feedId,
            GUARDIAN_SET_INDEX,
            _guardians(),
            PYTHNET_CHAIN_ID,
            PYTHNET_EMITTER,
            1 hours,
            100, // 1% max confidence interval
            deployer
        );
        WritOptions core = new WritOptions(usdcAddr, btcAddr, address(adapter));

        // The deployer is the first maker. Nothing about the code path is
        // special to it: registering a second maker is the same calls.
        core.registerMaker(deployer, quoteSigner);
        core.setMakerPremiumCap(uint128(premiumCap));

        if (owner != address(0)) core.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("chainId:      ", block.chainid);
        console2.log("USDC:         ", usdcAddr);
        console2.log("BTC:          ", btcAddr);
        console2.log("Oracle:       ", address(adapter));
        console2.log("WritOptions:  ", address(core));
        console2.log("Maker:        ", deployer);
        console2.log("Quote signer: ", quoteSigner);
    }
}
